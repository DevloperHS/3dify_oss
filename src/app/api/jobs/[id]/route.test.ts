import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { asset, job } from "@/db/schema";
import { signedInHeaders } from "@/test/auth-test-utils";
import { getCurrentUser } from "@/lib/session";

vi.mock("@/storage/assets", () => ({
  assetStorage: {
    uploadGlb: vi.fn(async () => {}),
    downloadUrl: vi.fn(async (key: string) => `https://assets.test/${key}?signed`),
  },
}));

import { GET } from "./route";

async function seedJob(
  ownerId: string,
  status: "queued" | "reconstructing" | "succeeded" | "failed",
  options?: { failureReason?: string; withAsset?: boolean },
) {
  const jobId = crypto.randomUUID();
  await db.insert(job).values({
    id: jobId,
    userId: ownerId,
    status,
    failureReason: options?.failureReason,
    sourceImageUrl: "https://res.cloudinary.test/source.png",
    sourceImagePublicId: "source-images/test",
  });
  if (options?.withAsset) {
    await db.insert(asset).values({
      id: crypto.randomUUID(),
      jobId,
      userId: ownerId,
      r2Key: `assets/${ownerId}/${jobId}.glb`,
      sizeBytes: 1234,
    });
  }
  return jobId;
}

function statusRequest(headers: Headers, id: string) {
  return [
    new Request(`http://localhost/api/jobs/${id}`, { headers }),
    { params: Promise.resolve({ id }) },
  ] as const;
}

async function signedInUser(prefix: string) {
  const headers = await signedInHeaders(
    `${prefix}-${Date.now()}@example.com`,
    "Poller",
  );
  const currentUser = await getCurrentUser(headers);
  return { headers, userId: currentUser!.id };
}

describe("GET /api/jobs/:id", () => {
  it("rejects an unauthenticated request", async () => {
    const [request, ctx] = statusRequest(new Headers(), crypto.randomUUID());
    const response = await GET(request, ctx);
    expect(response.status).toBe(401);
  });

  it("404s for a job that does not exist", async () => {
    const { headers } = await signedInUser("status-missing");
    const [request, ctx] = statusRequest(headers, crypto.randomUUID());
    const response = await GET(request, ctx);
    expect(response.status).toBe(404);
  });

  it("404s for another user's job (no existence leak)", async () => {
    const owner = await signedInUser("status-owner");
    const other = await signedInUser("status-other");
    const jobId = await seedJob(owner.userId, "queued");

    const [request, ctx] = statusRequest(other.headers, jobId);
    const response = await GET(request, ctx);
    expect(response.status).toBe(404);
  });

  it("returns the status of an in-flight job", async () => {
    const { headers, userId } = await signedInUser("status-inflight");
    const jobId = await seedJob(userId, "reconstructing");

    const [request, ctx] = statusRequest(headers, jobId);
    const response = await GET(request, ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ id: jobId, status: "reconstructing" });
    expect(body.asset).toBeUndefined();
  });

  it("returns a failure reason for a failed job", async () => {
    const { headers, userId } = await signedInUser("status-failed");
    const jobId = await seedJob(userId, "failed", {
      failureReason: "processing error",
    });

    const [request, ctx] = statusRequest(headers, jobId);
    const body = await (await GET(request, ctx)).json();
    expect(body.status).toBe("failed");
    expect(body.failureReason).toBe("processing error");
  });

  it("returns the asset's download URL once the job has succeeded", async () => {
    const { headers, userId } = await signedInUser("status-done");
    const jobId = await seedJob(userId, "succeeded", { withAsset: true });

    const [request, ctx] = statusRequest(headers, jobId);
    const body = await (await GET(request, ctx)).json();
    expect(body.status).toBe("succeeded");
    expect(body.asset.url).toBe(
      `https://assets.test/assets/${userId}/${jobId}.glb?signed`,
    );
    expect(body.asset.sizeBytes).toBe(1234);
  });
});
