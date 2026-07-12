import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { asset, job } from "@/db/schema";
import type { JobStatus } from "@/jobs/state-machine";

// Library view queries (ticket 08): a user's full Job history and permanent
// Asset library. Everything is filtered by the owning user here, at the
// query — the page never sees another user's rows.

export type JobHistoryEntry = {
  id: string;
  status: JobStatus;
  failureReason: string | null;
  createdAt: Date;
  assetId: string | null;
};

export async function listJobHistory(
  db: Db,
  userId: string,
): Promise<JobHistoryEntry[]> {
  const rows = await db
    .select({
      id: job.id,
      status: job.status,
      failureReason: job.failureReason,
      createdAt: job.createdAt,
      assetId: asset.id,
    })
    .from(job)
    .leftJoin(asset, eq(asset.jobId, job.id))
    .where(eq(job.userId, userId))
    .orderBy(desc(job.createdAt));
  return rows;
}

export type LibraryAsset = {
  id: string;
  jobId: string;
  // The object key in the S3-compatible asset store (the column keeps its
  // historical r2_key name; the storage stopped being R2-specific in 2e62d7c).
  storageKey: string;
  sizeBytes: number;
  createdAt: Date;
};

export async function listAssets(
  db: Db,
  userId: string,
): Promise<LibraryAsset[]> {
  return db
    .select({
      id: asset.id,
      jobId: asset.jobId,
      storageKey: asset.r2Key,
      sizeBytes: asset.sizeBytes,
      createdAt: asset.createdAt,
    })
    .from(asset)
    .where(eq(asset.userId, userId))
    .orderBy(desc(asset.createdAt));
}
