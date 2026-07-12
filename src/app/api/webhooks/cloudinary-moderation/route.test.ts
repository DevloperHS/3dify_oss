import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { job, user } from "@/db/schema";
import { MODERATION_FAILURE_REASON } from "@/moderation/gate";

vi.mock("@/jobs/queue", () => ({
  enqueueJob: vi.fn(async () => {}),
}));

import { POST } from "./route";
import { enqueueJob } from "@/jobs/queue";

async function createModeratingJob(status: "moderating" | "failed" = "moderating") {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    name: "Webhook User",
    email: `webhook-${userId}@example.com`,
  });
  const jobId = crypto.randomUUID();
  const publicId = `source-images/${jobId}`;
  await db.insert(job).values({
    id: jobId,
    userId,
    status,
    sourceImageUrl: `https://res.cloudinary.test/${publicId}.png`,
    sourceImagePublicId: publicId,
  });
  return { jobId, publicId };
}

function signedRequest(payload: unknown, options?: { badSignature?: boolean }) {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHash("sha1")
    .update(rawBody + timestamp + (options?.badSignature ? "wrong" : process.env.CLOUDINARY_API_SECRET!))
    .digest("hex");
  return new Request("http://localhost/api/webhooks/cloudinary-moderation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cld-timestamp": timestamp,
      "x-cld-signature": signature,
    },
    body: rawBody,
  });
}

function moderationPayload(publicId: string, status: "approved" | "rejected") {
  return {
    notification_type: "moderation",
    moderation_kind: "aws_rek",
    moderation_status: status,
    public_id: publicId,
  };
}

describe("POST /api/webhooks/cloudinary-moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLOUDINARY_API_SECRET ??= "test-secret";
  });

  it("enqueues the job on approval, leaving the worker to advance it", async () => {
    const { jobId, publicId } = await createModeratingJob();
    const response = await POST(signedRequest(moderationPayload(publicId, "approved")));
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("advanced");
    expect(enqueueJob).toHaveBeenCalledWith(jobId);

    const [row] = await db.select().from(job).where(eq(job.id, jobId));
    expect(row.status).toBe("moderating");
  });

  it("terminally fails the job on rejection, without enqueueing", async () => {
    const { jobId, publicId } = await createModeratingJob();
    const response = await POST(signedRequest(moderationPayload(publicId, "rejected")));
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("failed");
    expect(enqueueJob).not.toHaveBeenCalled();

    const [row] = await db.select().from(job).where(eq(job.id, jobId));
    expect(row.status).toBe("failed");
    expect(row.failureCategory).toBe("terminal");
    expect(row.failureReason).toBe(MODERATION_FAILURE_REASON);
    expect(row.failureReason).not.toMatch(/rekognition|cloudinary|aws/i);
  });

  it("rejects an unsigned/mis-signed notification and touches nothing", async () => {
    const { jobId, publicId } = await createModeratingJob();
    const response = await POST(
      signedRequest(moderationPayload(publicId, "rejected"), { badSignature: true }),
    );
    expect(response.status).toBe(401);

    const [row] = await db.select().from(job).where(eq(job.id, jobId));
    expect(row.status).toBe("moderating");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate delivery for an already-terminal job without re-enqueueing", async () => {
    const { publicId } = await createModeratingJob("failed");
    const response = await POST(signedRequest(moderationPayload(publicId, "approved")));
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("already-terminal");
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("acknowledges an unknown public_id (job deleted or foreign)", async () => {
    const response = await POST(
      signedRequest(moderationPayload("source-images/nonexistent", "approved")),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe("job-not-found");
  });

  it("ignores non-moderation notifications", async () => {
    const response = await POST(
      signedRequest({ notification_type: "upload", public_id: "x" }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).ignored).toBe(true);
  });
});
