import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { asset, job } from "@/db/schema";
import { categorize, PipelineFailure } from "@/jobs/failures";
import { canTransition, isTerminal, type JobStatus } from "@/jobs/state-machine";
import { repairToWatertight } from "@/postprocessing/watertight";
import { downscaleIfNeeded } from "@/preprocessing/downscale";
import type { ReconstructionEngine } from "@/reconstruction/engine";
import type { AssetStorage } from "@/storage/assets";

// The worker-side pipeline for one Job: Preprocessing → Reconstruction →
// Postprocessing → Export/Storage (Moderation happens before enqueue, via
// the Cloudinary webhook — ticket 06). External effects go through injected
// deps so tests can run against the test db with fakes; Pre/Postprocessing
// are pure CPU, so the real implementations run everywhere, tests included.
//
// Failure handling (ticket 07): failures are tagged terminal/transient where
// they're raised (PipelineFailure). A transient failure with attempts left
// just rethrows — BullMQ redelivers with backoff, and stage transitions are
// written only when they move the Job forward, so a retry re-enters cleanly
// from wherever the last attempt died. Terminal failures and exhausted
// transient failures mark the Job failed with a categorized, user-facing
// reason.

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

export type JobAttempt = {
  number: number;
  max: number;
};

export async function processJob(
  deps: ProcessJobDeps,
  jobId: string,
  attempt: JobAttempt = { number: 1, max: 1 },
): Promise<void> {
  const [row] = await deps.db.select().from(job).where(eq(job.id, jobId));
  if (!row) throw new Error(`job ${jobId} not found`);
  // Terminal already — a duplicate/stale queue delivery. Nothing to do.
  if (isTerminal(row.status)) return;

  await deps.db
    .update(job)
    .set({ attempts: attempt.number, updatedAt: new Date() })
    .where(eq(job.id, jobId));

  try {
    let status = await advanceTo(deps.db, jobId, row.status, "preprocessing");
    const image = await deps.fetchImage(row.sourceImageUrl);
    // Oversized sources (>2048px) are downscaled, never rejected (ticket 05).
    const preprocessed = await downscaleIfNeeded(image.bytes, image.contentType);

    status = await advanceTo(deps.db, jobId, status, "reconstructing");
    const { glb } = await deps.engine.reconstruct({
      imageBytes: preprocessed.bytes,
      contentType: preprocessed.contentType,
    });

    status = await advanceTo(deps.db, jobId, status, "postprocessing");
    // Repairs holes and verifies watertightness — throws (failing the job)
    // rather than letting an open mesh reach storage.
    const { glb: repairedGlb } = await repairToWatertight(glb);

    status = await advanceTo(deps.db, jobId, status, "exporting");
    const r2Key = `assets/${row.userId}/${jobId}.glb`;
    await deps.assets.uploadGlb(r2Key, repairedGlb);
    await deps.db
      .insert(asset)
      .values({
        id: crypto.randomUUID(),
        jobId,
        userId: row.userId,
        r2Key,
        sizeBytes: repairedGlb.byteLength,
      })
      // A retry that died between upload and success already has the row.
      .onConflictDoNothing({ target: asset.jobId });

    await advanceTo(deps.db, jobId, status, "succeeded");
  } catch (error) {
    const { category, userFacingReason } = categorize(error);
    const attemptsExhausted = attempt.number >= attempt.max;
    if (category === "terminal" || attemptsExhausted) {
      await markFailed(deps.db, jobId, category, userFacingReason);
    }
    // Rethrow either way: BullMQ records the attempt, and (for transient
    // failures with attempts left) schedules the retry. The worker maps
    // terminal failures to UnrecoverableError so BullMQ stops retrying.
    throw error;
  }
}

// Writes a stage transition only when it moves the Job forward; a retry
// re-entering the pipeline at an earlier stage than the row's current status
// simply doesn't touch the row until it catches up. Returns the effective
// current status.
async function advanceTo(
  db: Db,
  jobId: string,
  current: JobStatus,
  target: JobStatus,
): Promise<JobStatus> {
  if (!canTransition(current, target)) return current;
  await db
    .update(job)
    .set({ status: target, updatedAt: new Date() })
    .where(eq(job.id, jobId));
  return target;
}

async function markFailed(
  db: Db,
  jobId: string,
  category: PipelineFailure["category"],
  userFacingReason: string,
) {
  const [row] = await db.select().from(job).where(eq(job.id, jobId));
  if (!row || !canTransition(row.status, "failed")) return;
  await db
    .update(job)
    .set({
      status: "failed",
      failureCategory: category,
      failureReason: userFacingReason,
      updatedAt: new Date(),
    })
    .where(eq(job.id, jobId));
}
