import "dotenv/config";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import { cleanupExpiredSourceImages } from "@/cleanup/source-images";
import { db } from "@/db";
import { PipelineFailure } from "@/jobs/failures";
import {
  createRedisConnection,
  JOB_MAX_ATTEMPTS,
  JOBS_QUEUE_NAME,
  MAINTENANCE_QUEUE_NAME,
  SOURCE_IMAGE_CLEANUP_CRON,
  SOURCE_IMAGE_CLEANUP_JOB,
  type JobQueuePayload,
} from "@/jobs/queue";
import { selectEngineFromEnv } from "@/reconstruction/select-engine";
import { assetStorage } from "@/storage/assets";
import { sourceImageStorage } from "@/storage/source-images";
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

// Daily Source Image retention sweep (ticket 09), scheduled and consumed by
// this same process — no extra infrastructure.
const maintenanceQueue = new Queue(MAINTENANCE_QUEUE_NAME, {
  connection: createRedisConnection(),
});
maintenanceQueue
  .upsertJobScheduler(
    SOURCE_IMAGE_CLEANUP_JOB,
    { pattern: SOURCE_IMAGE_CLEANUP_CRON },
    { name: SOURCE_IMAGE_CLEANUP_JOB },
  )
  .catch((error: Error) => {
    console.error(`[worker] failed to schedule cleanup: ${error.message}`);
  });

const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE_NAME,
  async () => {
    const { swept } = await cleanupExpiredSourceImages(db, sourceImageStorage);
    console.log(`[worker] source-image cleanup swept ${swept} image(s)`);
  },
  { connection: createRedisConnection() },
);
maintenanceWorker.on("failed", (_bullJob, error) => {
  console.error(`[worker] source-image cleanup failed: ${error.message}`);
});

console.log(
  `[worker] listening on queues "${JOBS_QUEUE_NAME}", "${MAINTENANCE_QUEUE_NAME}"`,
);
