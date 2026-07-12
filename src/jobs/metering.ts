import { and, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { job } from "@/db/schema";

// Metering readiness (spec.md "Job orchestration"): only Jobs that reach
// `succeeded` count toward any future per-user usage figure. Failed Jobs
// never count — terminal or transient-exhausted alike, even when GPU compute
// was spent before giving up. A counting rule, not an enforced quota.

export async function succeededJobCount(
  db: Db,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(job)
    .where(and(eq(job.userId, userId), eq(job.status, "succeeded")));
  return row.value;
}
