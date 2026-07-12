import "dotenv/config";
import { Worker } from "bullmq";
import { db } from "@/db";
import { createRedisConnection, JOBS_QUEUE_NAME, type JobQueuePayload } from "@/jobs/queue";
import { StubReconstructionEngine } from "@/reconstruction/stub-engine";
import { assetStorage } from "@/storage/assets";
import { processJob, type FetchedImage } from "./process-job";

// The separate worker process from the spec's stack: consumes the BullMQ
// queue and runs the pipeline for each Job. Run with `pnpm worker`.
// The stub engine is swapped for TripoSR-on-Modal in ticket 03 — nothing
// else here changes.

async function fetchImage(url: string): Promise<FetchedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetching source image failed: HTTP ${response.status}`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
  };
}

const deps = {
  db,
  engine: new StubReconstructionEngine(),
  assets: assetStorage,
  fetchImage,
};

const worker = new Worker<JobQueuePayload>(
  JOBS_QUEUE_NAME,
  async (bullJob) => {
    await processJob(deps, bullJob.data.jobId);
  },
  { connection: createRedisConnection() },
);

worker.on("completed", (bullJob) => {
  console.log(`[worker] job ${bullJob.data.jobId} succeeded`);
});
worker.on("failed", (bullJob, error) => {
  console.error(`[worker] job ${bullJob?.data.jobId} failed: ${error.message}`);
});

console.log(`[worker] listening on queue "${JOBS_QUEUE_NAME}"`);
