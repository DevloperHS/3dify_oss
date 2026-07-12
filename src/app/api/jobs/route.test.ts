import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { job } from "@/db/schema";
import { signedInHeaders } from "@/test/auth-test-utils";

vi.mock("@/storage/source-images", () => ({
  sourceImageStorage: {
    upload: vi.fn(async () => ({
      url: "https://res.cloudinary.test/source-images/abc.png",
      publicId: "source-images/abc",
    })),
  },
}));

vi.mock("@/jobs/queue", () => ({
  enqueueJob: vi.fn(async () => {}),
}));

import { POST } from "./route";
import { sourceImageStorage } from "@/storage/source-images";
import { enqueueJob } from "@/jobs/queue";

function uploadRequest(headers: Headers, file?: File | string) {
  const formData = new FormData();
  if (file !== undefined) formData.set("image", file);
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers,
    body: formData,
  });
}

const pngFile = () =>
  new File([new Uint8Array([137, 80, 78, 71])], "photo.png", {
    type: "image/png",
  });

describe("POST /api/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await POST(uploadRequest(new Headers(), pngFile()));
    expect(response.status).toBe(401);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("rejects a request without an image file", async () => {
    const headers = await signedInHeaders(
      `upload-nofile-${Date.now()}@example.com`,
      "Uploader",
    );
    const response = await POST(uploadRequest(headers));
    expect(response.status).toBe(400);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("rejects a non-image file", async () => {
    const headers = await signedInHeaders(
      `upload-badtype-${Date.now()}@example.com`,
      "Uploader",
    );
    const file = new File(["not an image"], "notes.txt", { type: "text/plain" });
    const response = await POST(uploadRequest(headers, file));
    expect(response.status).toBe(400);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("stores the image, creates a queued job owned by the user, and enqueues it", async () => {
    const email = `upload-ok-${Date.now()}@example.com`;
    const headers = await signedInHeaders(email, "Uploader");

    const response = await POST(uploadRequest(headers, pngFile()));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("queued");

    const [row] = await db.select().from(job).where(eq(job.id, body.id));
    expect(row.status).toBe("queued");
    expect(row.sourceImageUrl).toBe(
      "https://res.cloudinary.test/source-images/abc.png",
    );
    expect(sourceImageStorage.upload).toHaveBeenCalledOnce();
    expect(enqueueJob).toHaveBeenCalledWith(body.id);
  });
});
