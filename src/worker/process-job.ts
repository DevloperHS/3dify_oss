import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { asset, job } from "@/db/schema";
import { assertTransition, canTransition, isTerminal, type JobStatus } from "@/jobs/state-machine";
import { repairToWatertight } from "@/postprocessing/watertight";
import { downscaleIfNeeded } from "@/preprocessing/downscale";
import type { ReconstructionEngine } from "@/reconstruction/engine";
import type { AssetStorage } from "@/storage/assets";

// The worker-side pipeline for one Job: Preprocessing → Reconstruction →
// Postprocessing → Export/Storage (Moderation slots in ahead in ticket 06).
// External effects go through injected deps so tests can run against the test
// db with fakes; Pre/Postprocessing are pure CPU, so the real implementations
// run everywhere, tests included.

export type FetchedImage = {
  bytes: Uint8Array;
  contentType: string;
};

export type ProcessJobDeps = {
  db: Db;
  engine: ReconstructionEngine;
  assets: AssetStorage;
  fetchImage(url: string): Promise<FetchedImage>;
};

export async function processJob(deps: ProcessJobDeps, jobId: string): Promise<void> {
  const [row] = await deps.db.select().from(job).where(eq(job.id, jobId));
  if (!row) throw new Error(`job ${jobId} not found`);
  // Terminal already — a duplicate/stale queue delivery. Nothing to do.
  if (isTerminal(row.status)) return;

  try {
    await transition(deps.db, jobId, row.status, "preprocessing");
    const image = await deps.fetchImage(row.sourceImageUrl);
    // Oversized sources (>2048px) are downscaled, never rejected (ticket 05).
    const preprocessed = await downscaleIfNeeded(image.bytes, image.contentType);

    await transition(deps.db, jobId, "preprocessing", "reconstructing");
    const { glb } = await deps.engine.reconstruct({
      imageBytes: preprocessed.bytes,
      contentType: preprocessed.contentType,
    });

    await transition(deps.db, jobId, "reconstructing", "postprocessing");
    // Repairs holes and verifies watertightness — throws (failing the job)
    // rather than letting an open mesh reach storage.
    const { glb: repairedGlb } = await repairToWatertight(glb);

    await transition(deps.db, jobId, "postprocessing", "exporting");
    const r2Key = `assets/${row.userId}/${jobId}.glb`;
    await deps.assets.uploadGlb(r2Key, repairedGlb);
    await deps.db.insert(asset).values({
      id: crypto.randomUUID(),
      jobId,
      userId: row.userId,
      r2Key,
      sizeBytes: repairedGlb.byteLength,
    });

    await transition(deps.db, jobId, "exporting", "succeeded");
  } catch (error) {
    // Minimal failure surfacing: a generic, user-facing reason with no
    // internal detail. Categorization (terminal/transient) and retries are
    // ticket 07. Rethrow so BullMQ records the attempt as failed.
    await markFailed(deps.db, jobId);
    throw error;
  }
}

async function transition(db: Db, jobId: string, from: JobStatus, to: JobStatus) {
  assertTransition(from, to);
  await db
    .update(job)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(job.id, jobId));
}

async function markFailed(db: Db, jobId: string) {
  const [row] = await db.select().from(job).where(eq(job.id, jobId));
  if (!row || !canTransition(row.status, "failed")) return;
  await db
    .update(job)
    .set({ status: "failed", failureReason: "processing error", updatedAt: new Date() })
    .where(eq(job.id, jobId));
}
