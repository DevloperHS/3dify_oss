import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { asset, job } from "@/db/schema";

// Library view queries (ticket 08): a user's full Job history and permanent
// Asset library. Everything is filtered by the owning user here, at the
// query — the page never sees another user's rows.

export type JobHistoryEntry = {
  id: string;
  status: string;
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
  r2Key: string;
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
      r2Key: asset.r2Key,
      sizeBytes: asset.sizeBytes,
      createdAt: asset.createdAt,
    })
    .from(asset)
    .where(eq(asset.userId, userId))
    .orderBy(desc(asset.createdAt));
}
