import { Queue } from "bullmq";
import IORedis from "ioredis";

// Redis/BullMQ queue between Upload/Ingestion (Next.js API route, producer)
// and the worker process (consumer). One queue; the payload is just the Job
// row's id — all state lives in Postgres, guarded by the state machine.

export const JOBS_QUEUE_NAME = "jobs";

// Retry policy (ticket 07, spec.md "Job orchestration"): 3 total attempts
// (1 original + 2 retries), exponential backoff starting at 10s (10s, 20s).
// Terminal failures bypass this — the worker throws UnrecoverableError,
// which BullMQ never retries.
export const JOB_MAX_ATTEMPTS = 3;
export const JOB_BACKOFF_INITIAL_MS = 10_000;

export type JobQueuePayload = {
  jobId: string;
};

export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set — see .env.example");
  }
  // BullMQ requires maxRetriesPerRequest: null on its connections.
  return new IORedis(url, { maxRetriesPerRequest: null });
}

let queue: Queue<JobQueuePayload> | null = null;

function jobsQueue(): Queue<JobQueuePayload> {
  const existing =
    queue ??
    new Queue<JobQueuePayload>(JOBS_QUEUE_NAME, {
      connection: createRedisConnection(),
    });
  queue = existing;
  return existing;
}

// Maintenance queue (ticket 09): scheduled sweeps, separate from the
// pipeline queue so cleanup work never competes with user jobs.
export const MAINTENANCE_QUEUE_NAME = "maintenance";
export const SOURCE_IMAGE_CLEANUP_JOB = "source-image-cleanup";
// Daily at 03:00 — the retention window is measured in days, so any daily
// cadence satisfies it.
export const SOURCE_IMAGE_CLEANUP_CRON = "0 3 * * *";

export async function enqueueJob(jobId: string): Promise<void> {
  // Keyed by the Job row's id so a double-submit can't enqueue it twice.
  await jobsQueue().add(
    "process",
    { jobId },
    {
      jobId,
      attempts: JOB_MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: JOB_BACKOFF_INITIAL_MS },
    },
  );
}
