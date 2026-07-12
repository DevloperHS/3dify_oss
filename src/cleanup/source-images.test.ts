import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { asset, job, user } from "@/db/schema";
import type { JobStatus } from "@/jobs/state-machine";
import {
  cleanupExpiredSourceImages,
  type SourceImageDeleter,
} from "./source-images";

const NOW = new Date("2026-07-12T12:00:00Z");
const ELEVEN_DAYS_AGO = new Date("2026-07-01T12:00:00Z");
const FIVE_DAYS_AGO = new Date("2026-07-07T12:00:00Z");

function fakeDeleter(alreadyGone: string[] = []) {
  const destroyed: string[] = [];
  const deleter: SourceImageDeleter = {
    async destroy(publicId) {
      destroyed.push(publicId);
      return alreadyGone.includes(publicId) ? "not-found" : "deleted";
    },
  };
  return { deleter, destroyed };
}

async function createJob(options: {
  status: JobStatus;
  updatedAt: Date;
  withAsset?: boolean;
}) {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    name: "Cleanup User",
    email: `cleanup-${userId}@example.com`,
  });
  const jobId = crypto.randomUUID();
  const publicId = `source-images/${jobId}`;
  await db.insert(job).values({
    id: jobId,
    userId,
    status: options.status,
    updatedAt: options.updatedAt,
    sourceImageUrl: `https://res.cloudinary.test/${publicId}.png`,
    sourceImagePublicId: publicId,
  });
  if (options.withAsset) {
    await db.insert(asset).values({
      id: crypto.randomUUID(),
      jobId,
      userId,
      r2Key: `assets/${userId}/${jobId}.glb`,
      sizeBytes: 99,
    });
  }
  return { jobId, publicId };
}

describe("cleanupExpiredSourceImages", () => {
  it("sweeps source images of jobs terminal for more than 10 days", async () => {
    const succeeded = await createJob({ status: "succeeded", updatedAt: ELEVEN_DAYS_AGO });
    const failed = await createJob({ status: "failed", updatedAt: ELEVEN_DAYS_AGO });
    const { deleter, destroyed } = fakeDeleter();

    await cleanupExpiredSourceImages(db, deleter, NOW);

    expect(destroyed).toEqual(
      expect.arrayContaining([succeeded.publicId, failed.publicId]),
    );
    const [row] = await db.select().from(job).where(eq(job.id, succeeded.jobId));
    expect(row.sourceImageDeletedAt).toEqual(NOW);
  });

  it("leaves jobs within the 10-day window and non-terminal jobs untouched", async () => {
    const recent = await createJob({ status: "succeeded", updatedAt: FIVE_DAYS_AGO });
    const inflight = await createJob({ status: "reconstructing", updatedAt: ELEVEN_DAYS_AGO });
    const { deleter, destroyed } = fakeDeleter();

    await cleanupExpiredSourceImages(db, deleter, NOW);

    expect(destroyed).not.toContain(recent.publicId);
    expect(destroyed).not.toContain(inflight.publicId);
    const [recentRow] = await db.select().from(job).where(eq(job.id, recent.jobId));
    expect(recentRow.sourceImageDeletedAt).toBeNull();
  });

  it("is idempotent: a second run sweeps nothing new", async () => {
    const { publicId } = await createJob({ status: "succeeded", updatedAt: ELEVEN_DAYS_AGO });
    const first = fakeDeleter();
    await cleanupExpiredSourceImages(db, first.deleter, NOW);
    expect(first.destroyed).toContain(publicId);

    const second = fakeDeleter();
    await cleanupExpiredSourceImages(db, second.deleter, NOW);
    expect(second.destroyed).not.toContain(publicId);
  });

  it("treats an already-gone image (not-found) as swept, without erroring", async () => {
    const { jobId, publicId } = await createJob({ status: "failed", updatedAt: ELEVEN_DAYS_AGO });
    const { deleter } = fakeDeleter([publicId]);

    await cleanupExpiredSourceImages(db, deleter, NOW);

    const [row] = await db.select().from(job).where(eq(job.id, jobId));
    expect(row.sourceImageDeletedAt).toEqual(NOW);
  });

  it("keeps sweeping past a poisoned image, then surfaces the failure", async () => {
    const poisoned = await createJob({ status: "failed", updatedAt: ELEVEN_DAYS_AGO });
    const healthy = await createJob({ status: "succeeded", updatedAt: ELEVEN_DAYS_AGO });
    const deleter: SourceImageDeleter = {
      async destroy(publicId) {
        if (publicId === poisoned.publicId) throw new Error("provider exploded");
        return "deleted";
      },
    };

    await expect(cleanupExpiredSourceImages(db, deleter, NOW)).rejects.toThrow(
      /1 deletion\(s\) failed/,
    );

    const [healthyRow] = await db.select().from(job).where(eq(job.id, healthy.jobId));
    expect(healthyRow.sourceImageDeletedAt).toEqual(NOW);
    const [poisonedRow] = await db.select().from(job).where(eq(job.id, poisoned.jobId));
    expect(poisonedRow.sourceImageDeletedAt).toBeNull(); // retried next run
  });

  it("does not touch the job's Asset", async () => {
    const { jobId } = await createJob({
      status: "succeeded",
      updatedAt: ELEVEN_DAYS_AGO,
      withAsset: true,
    });
    const { deleter } = fakeDeleter();

    await cleanupExpiredSourceImages(db, deleter, NOW);

    const [assetRow] = await db.select().from(asset).where(eq(asset.jobId, jobId));
    expect(assetRow).toBeDefined();
    expect(assetRow.r2Key).toContain(jobId);
  });
});
