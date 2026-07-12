import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { asset, job, user } from "@/db/schema";
import { countBoundaryEdges } from "@/postprocessing/watertight";
import { StubReconstructionEngine } from "@/reconstruction/stub-engine";
import { testImage } from "@/test/image-test-utils";
import type { AssetStorage } from "@/storage/assets";
import { processJob, type ProcessJobDeps } from "./process-job";

function fakeAssetStorage() {
  const uploads = new Map<string, Uint8Array>();
  const storage: AssetStorage = {
    async uploadGlb(key, bytes) {
      uploads.set(key, bytes);
    },
    async downloadUrl(key) {
      return `https://assets.test/${key}`;
    },
  };
  return { storage, uploads };
}

// A real decodable PNG — preprocessing (downscale) parses it for real.
const fakeFetchImage: ProcessJobDeps["fetchImage"] = async () => ({
  bytes: await testImage("png", 300, 300),
  contentType: "image/png",
});

async function createUserAndJob(status: "queued" | "succeeded" = "queued") {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    name: "Test User",
    email: `worker-${userId}@example.com`,
  });
  const jobId = crypto.randomUUID();
  await db.insert(job).values({
    id: jobId,
    userId,
    status,
    sourceImageUrl: "https://res.cloudinary.test/source.png",
    sourceImagePublicId: "source-images/test",
  });
  return { userId, jobId };
}

describe("processJob", () => {
  it("drives a queued job to succeeded and stores the asset", async () => {
    const { userId, jobId } = await createUserAndJob();
    const { storage, uploads } = fakeAssetStorage();

    await processJob(
      {
        db,
        engine: new StubReconstructionEngine(),
        assets: storage,
        fetchImage: fakeFetchImage,
      },
      jobId,
    );

    const [jobRow] = await db.select().from(job).where(eq(job.id, jobId));
    expect(jobRow.status).toBe("succeeded");
    expect(jobRow.failureReason).toBeNull();

    const [assetRow] = await db.select().from(asset).where(eq(asset.jobId, jobId));
    expect(assetRow).toBeDefined();
    expect(assetRow.userId).toBe(userId);
    expect(uploads.has(assetRow.r2Key)).toBe(true);

    const glb = uploads.get(assetRow.r2Key)!;
    expect(assetRow.sizeBytes).toBe(glb.byteLength);
    // GLB magic — the uploaded bytes are the engine's output, not garbage.
    expect(new DataView(glb.buffer, glb.byteOffset).getUint32(0, true)).toBe(
      0x46546c67,
    );
    // Postprocessing ran: what reaches storage is watertight (ticket 04).
    expect(await countBoundaryEdges(glb)).toBe(0);
  });

  it("marks the job failed when the engine throws, and stores no asset", async () => {
    const { jobId } = await createUserAndJob();
    const { storage } = fakeAssetStorage();
    const failingEngine = {
      async reconstruct(): Promise<never> {
        throw new Error("GPU exploded");
      },
    };

    await expect(
      processJob(
        { db, engine: failingEngine, assets: storage, fetchImage: fakeFetchImage },
        jobId,
      ),
    ).rejects.toThrow("GPU exploded");

    const [jobRow] = await db.select().from(job).where(eq(job.id, jobId));
    expect(jobRow.status).toBe("failed");
    // User-facing reason only — internal error detail must not leak.
    expect(jobRow.failureReason).toBe("processing error");
    expect(jobRow.failureReason).not.toContain("GPU");

    const assetRows = await db.select().from(asset).where(eq(asset.jobId, jobId));
    expect(assetRows).toHaveLength(0);
  });

  it("leaves a job that is already terminal untouched", async () => {
    const { jobId } = await createUserAndJob("succeeded");
    const { storage, uploads } = fakeAssetStorage();

    await processJob(
      {
        db,
        engine: new StubReconstructionEngine(),
        assets: storage,
        fetchImage: fakeFetchImage,
      },
      jobId,
    );

    const [jobRow] = await db.select().from(job).where(eq(job.id, jobId));
    expect(jobRow.status).toBe("succeeded");
    expect(uploads.size).toBe(0);
  });

  it("throws on an unknown job id", async () => {
    const { storage } = fakeAssetStorage();
    await expect(
      processJob(
        {
          db,
          engine: new StubReconstructionEngine(),
          assets: storage,
          fetchImage: fakeFetchImage,
        },
        crypto.randomUUID(),
      ),
    ).rejects.toThrow(/not found/);
  });
});
