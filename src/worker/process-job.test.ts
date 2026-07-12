import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { asset, job, user } from "@/db/schema";
import { PipelineFailure } from "@/jobs/failures";
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
    // User-facing reason only — internal error detail must not leak. An
    // untagged error defaults to transient.
    expect(jobRow.failureReason).toBe("processing error");
    expect(jobRow.failureReason).not.toContain("GPU");
    expect(jobRow.failureCategory).toBe("transient");

    const assetRows = await db.select().from(asset).where(eq(asset.jobId, jobId));
    expect(assetRows).toHaveLength(0);
  });

  it("fails immediately on a terminal failure, even with attempts left", async () => {
    const { jobId } = await createUserAndJob();
    const { storage } = fakeAssetStorage();
    const terminalEngine = {
      async reconstruct(): Promise<never> {
        throw new PipelineFailure(
          "terminal",
          "the image could not be turned into a 3D model",
          "HTTP 422 from endpoint",
        );
      },
    };

    await expect(
      processJob(
        { db, engine: terminalEngine, assets: storage, fetchImage: fakeFetchImage },
        jobId,
        { number: 1, max: 3 },
      ),
    ).rejects.toThrow(PipelineFailure);

    const [jobRow] = await db.select().from(job).where(eq(job.id, jobId));
    expect(jobRow.status).toBe("failed");
    expect(jobRow.failureCategory).toBe("terminal");
    expect(jobRow.failureReason).toBe("the image could not be turned into a 3D model");
    expect(jobRow.attempts).toBe(1);
  });

  it("leaves a transient failure unfailed while attempts remain, so BullMQ can retry", async () => {
    const { jobId } = await createUserAndJob();
    const { storage } = fakeAssetStorage();
    const flakyEngine = {
      async reconstruct(): Promise<never> {
        throw new PipelineFailure("transient", "the 3D reconstruction timed out");
      },
    };

    await expect(
      processJob(
        { db, engine: flakyEngine, assets: storage, fetchImage: fakeFetchImage },
        jobId,
        { number: 1, max: 3 },
      ),
    ).rejects.toThrow(PipelineFailure);

    const [jobRow] = await db.select().from(job).where(eq(job.id, jobId));
    expect(jobRow.status).not.toBe("failed");
    expect(jobRow.attempts).toBe(1);
  });

  it("fails a transient failure on its final attempt — never stuck retrying", async () => {
    const { jobId } = await createUserAndJob();
    const { storage } = fakeAssetStorage();
    const flakyEngine = {
      async reconstruct(): Promise<never> {
        throw new PipelineFailure("transient", "the 3D reconstruction timed out");
      },
    };

    await expect(
      processJob(
        { db, engine: flakyEngine, assets: storage, fetchImage: fakeFetchImage },
        jobId,
        { number: 3, max: 3 },
      ),
    ).rejects.toThrow(PipelineFailure);

    const [jobRow] = await db.select().from(job).where(eq(job.id, jobId));
    expect(jobRow.status).toBe("failed");
    expect(jobRow.failureCategory).toBe("transient");
    expect(jobRow.failureReason).toBe("the 3D reconstruction timed out");
    expect(jobRow.attempts).toBe(3);
  });

  it("re-enters cleanly on retry: a job stranded mid-pipeline still reaches succeeded", async () => {
    const { jobId } = await createUserAndJob();
    await db
      .update(job)
      .set({ status: "reconstructing" }) // where attempt 1 died
      .where(eq(job.id, jobId));
    const { storage } = fakeAssetStorage();

    await processJob(
      {
        db,
        engine: new StubReconstructionEngine(),
        assets: storage,
        fetchImage: fakeFetchImage,
      },
      jobId,
      { number: 2, max: 3 },
    );

    const [jobRow] = await db.select().from(job).where(eq(job.id, jobId));
    expect(jobRow.status).toBe("succeeded");
    expect(jobRow.attempts).toBe(2);
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
