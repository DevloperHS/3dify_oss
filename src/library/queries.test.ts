import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { asset, job, user } from "@/db/schema";
import { listAssets, listJobHistory } from "./queries";

async function createUser(): Promise<string> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    name: "Library User",
    email: `library-${userId}@example.com`,
  });
  return userId;
}

async function createJob(
  userId: string,
  options: {
    status: "succeeded" | "failed" | "reconstructing";
    createdAt?: Date;
    failureReason?: string;
    withAsset?: boolean;
  },
): Promise<{ jobId: string; assetId?: string }> {
  const jobId = crypto.randomUUID();
  await db.insert(job).values({
    id: jobId,
    userId,
    status: options.status,
    failureReason: options.failureReason,
    createdAt: options.createdAt,
    sourceImageUrl: "https://res.cloudinary.test/source.png",
    sourceImagePublicId: `source-images/${jobId}`,
  });
  if (!options.withAsset) return { jobId };
  const assetId = crypto.randomUUID();
  await db.insert(asset).values({
    id: assetId,
    jobId,
    userId,
    r2Key: `assets/${userId}/${jobId}.glb`,
    sizeBytes: 1234,
    createdAt: options.createdAt,
  });
  return { jobId, assetId };
}

describe("listJobHistory", () => {
  it("returns all of the user's jobs, most recent first, with outcome detail", async () => {
    const userId = await createUser();
    const old = await createJob(userId, {
      status: "succeeded",
      withAsset: true,
      createdAt: new Date("2026-07-01T10:00:00Z"),
    });
    const failed = await createJob(userId, {
      status: "failed",
      failureReason: "the image was rejected by content moderation",
      createdAt: new Date("2026-07-05T10:00:00Z"),
    });
    const inflight = await createJob(userId, {
      status: "reconstructing",
      createdAt: new Date("2026-07-10T10:00:00Z"),
    });

    const history = await listJobHistory(db, userId);
    expect(history.map((entry) => entry.id)).toEqual([
      inflight.jobId,
      failed.jobId,
      old.jobId,
    ]);
    expect(history[1].failureReason).toBe(
      "the image was rejected by content moderation",
    );
    expect(history[2].assetId).toBe(old.assetId);
    expect(history[0].assetId).toBeNull();
  });

  it("never returns another user's jobs", async () => {
    const alice = await createUser();
    const bob = await createUser();
    await createJob(alice, { status: "succeeded", withAsset: true });

    expect(await listJobHistory(db, bob)).toEqual([]);
  });
});

describe("listAssets", () => {
  it("returns only the user's assets, most recent first", async () => {
    const userId = await createUser();
    const other = await createUser();
    const first = await createJob(userId, {
      status: "succeeded",
      withAsset: true,
      createdAt: new Date("2026-07-02T10:00:00Z"),
    });
    const second = await createJob(userId, {
      status: "succeeded",
      withAsset: true,
      createdAt: new Date("2026-07-08T10:00:00Z"),
    });
    await createJob(other, { status: "succeeded", withAsset: true });

    const assets = await listAssets(db, userId);
    expect(assets.map((entry) => entry.id)).toEqual([
      second.assetId,
      first.assetId,
    ]);
    expect(assets[0].jobId).toBe(second.jobId);
    expect(assets[0].sizeBytes).toBe(1234);
  });
});
