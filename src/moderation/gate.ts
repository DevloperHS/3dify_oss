import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { job } from "@/db/schema";
import { isTerminal } from "@/jobs/state-machine";

// The Moderation gate (ticket 06, spec.md "Moderation"): a plain module
// wrapping Cloudinary's aws_rek add-on result. The gate is the enqueue
// itself — with moderation enabled, a Job is created in `moderating` and
// only ever reaches the BullMQ queue through an approval here, so no
// Reconstruction compute can run before screening (closes the handoff's
// "moderation bypass" debt for the moderated path).

export function moderationEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.MODERATION_ENABLED === "true";
}

// User-facing, categorized reason — deliberately free of provider detail.
export const MODERATION_FAILURE_REASON =
  "the image was rejected by content moderation";

export type ModerationResult = {
  sourceImagePublicId: string;
  status: "approved" | "rejected";
};

export type ModerationOutcome =
  | "advanced"
  | "failed"
  | "job-not-found"
  | "already-terminal";

export async function handleModerationResult(
  db: Db,
  result: ModerationResult,
  enqueue: (jobId: string) => Promise<void>,
): Promise<ModerationOutcome> {
  const [row] = await db
    .select()
    .from(job)
    .where(eq(job.sourceImagePublicId, result.sourceImagePublicId));
  if (!row) return "job-not-found";
  // Redelivered/duplicate notification for a settled job — acknowledge, do
  // nothing.
  if (isTerminal(row.status)) return "already-terminal";

  if (result.status === "approved") {
    await enqueue(row.id);
    return "advanced";
  }

  await db
    .update(job)
    .set({
      status: "failed",
      failureCategory: "terminal",
      failureReason: MODERATION_FAILURE_REASON,
      updatedAt: new Date(),
    })
    .where(eq(job.id, row.id));
  return "failed";
}
