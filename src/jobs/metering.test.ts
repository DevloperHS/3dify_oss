import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { job, user } from "@/db/schema";
import type { JobStatus } from "@/jobs/state-machine";
import { succeededJobCount } from "./metering";

async function createUserWithJobs(statuses: JobStatus[]): Promise<string> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    name: "Metered User",
    email: `metering-${userId}@example.com`,
  });
  for (const status of statuses) {
    await db.insert(job).values({
      id: crypto.randomUUID(),
      userId,
      status,
      sourceImageUrl: "https://res.cloudinary.test/source.png",
      sourceImagePublicId: `source-images/${crypto.randomUUID()}`,
    });
  }
  return userId;
}

describe("succeededJobCount", () => {
  it("counts only succeeded jobs — failed and in-flight never count", async () => {
    const userId = await createUserWithJobs([
      "succeeded",
      "succeeded",
      "failed", // terminal or transient-exhausted — excluded either way
      "failed",
      "reconstructing",
      "queued",
    ]);
    expect(await succeededJobCount(db, userId)).toBe(2);
  });

  it("does not leak across users", async () => {
    const other = await createUserWithJobs(["succeeded"]);
    const userId = await createUserWithJobs([]);
    expect(await succeededJobCount(db, userId)).toBe(0);
    expect(await succeededJobCount(db, other)).toBe(1);
  });
});
