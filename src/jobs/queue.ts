import { Queue } from "bullmq";
import IORedis from "ioredis";

// Redis/BullMQ queue between Upload/Ingestion (Next.js API route, producer)
// and the worker process (consumer). One queue; the payload is just the Job
// row's id — all state lives in Postgres, guarded by the state machine.

export const JOBS_QUEUE_NAME = "jobs";

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

export async function enqueueJob(jobId: string): Promise<void> {
  // Keyed by the Job row's id so a double-submit can't enqueue it twice.
  await jobsQueue().add("process", { jobId }, { jobId });
}
