import "dotenv/config";
import { UnrecoverableError, Worker } from "bullmq";
import { db } from "@/db";
import { PipelineFailure } from "@/jobs/failures";
import {
  createRedisConnection,
  JOB_MAX_ATTEMPTS,
  JOBS_QUEUE_NAME,
  type JobQueuePayload,
} from "@/jobs/queue";
import { selectEngineFromEnv } from "@/reconstruction/select-engine";
import { assetStorage } from "@/storage/assets";
import { processJob, type FetchedImage } from "./process-job";

// The separate worker process from the spec's stack: consumes the BullMQ
// queue and runs the pipeline for each Job. Run with `pnpm worker`.
// Reconstruction runs on TripoSR-on-Modal by default; set
// RECONSTRUCTION_ENGINE=stub for local dev without a Modal deployment.

async function fetchImage(url: string): Promise<FetchedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    // Storage/CDN hiccups are worth retrying.
    throw new PipelineFailure(
      "transient",
      "the uploaded image could not be retrieved",
      `fetching source image failed: HTTP ${response.status}`,
    );
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
  };
}

const deps = {
  db,
  engine: selectEngineFromEnv(),
  assets: assetStorage,
  fetchImage,
};

const worker = new Worker<JobQueuePayload>(
  JOBS_QUEUE_NAME,
  async (bullJob) => {
    const attempt = {
      number: bullJob.attemptsMade + 1,
      max: bullJob.opts.attempts ?? JOB_MAX_ATTEMPTS,
    };
    try {
      await processJob(deps, bullJob.data.jobId, attempt);
    } catch (error) {
      // Terminal failures must not burn the remaining retry attempts.
      if (error instanceof PipelineFailure && error.category === "terminal") {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
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
