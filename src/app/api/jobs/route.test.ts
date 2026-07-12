import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { job } from "@/db/schema";
import { signedInHeaders } from "@/test/auth-test-utils";
import { fakeGifBytes, fakeHeicBytes, testImage } from "@/test/image-test-utils";

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

const pngFile = async () =>
  new File([(await testImage("png", 512, 512)) as BlobPart], "photo.png", {
    type: "image/png",
  });

describe("POST /api/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await POST(uploadRequest(new Headers(), await pngFile()));
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

  it.each([
    ["a HEIC file", () => fakeHeicBytes() as BlobPart, /HEIC/],
    ["a GIF file", () => fakeGifBytes() as BlobPart, /JPEG, PNG, or WebP/],
  ])("rejects %s with a specific error, creating nothing", async (_name, bytes, message) => {
    const headers = await signedInHeaders(
      `upload-format-${crypto.randomUUID()}@example.com`,
      "Uploader",
    );
    const file = new File([bytes()], "photo.img", { type: "image/heic" });
    const response = await POST(uploadRequest(headers, file));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(message);
    expect(sourceImageStorage.upload).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("rejects an upload over 10MB before storing anything", async () => {
    const headers = await signedInHeaders(
      `upload-oversize-${Date.now()}@example.com`,
      "Uploader",
    );
    const blob = new Uint8Array(10 * 1024 * 1024 + 1);
    blob.set([0xff, 0xd8, 0xff]); // JPEG magic — size must reject first
    const file = new File([blob as BlobPart], "huge.jpg", { type: "image/jpeg" });
    const response = await POST(uploadRequest(headers, file));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/10MB/);
    expect(sourceImageStorage.upload).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("rejects an image below 256×256 with the measured size in the error", async () => {
    const headers = await signedInHeaders(
      `upload-small-${Date.now()}@example.com`,
      "Uploader",
    );
    const file = new File(
      [(await testImage("png", 100, 500)) as BlobPart],
      "small.png",
      { type: "image/png" },
    );
    const response = await POST(uploadRequest(headers, file));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/100×500/);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("accepts an oversized-resolution image (downscaling happens later)", async () => {
    const headers = await signedInHeaders(
      `upload-big-${Date.now()}@example.com`,
      "Uploader",
    );
    const file = new File(
      [(await testImage("jpeg", 2500, 2200)) as BlobPart],
      "big.jpg",
      { type: "image/jpeg" },
    );
    const response = await POST(uploadRequest(headers, file));
    expect(response.status).toBe(201);
  });

  it("stores the image, creates a queued job owned by the user, and enqueues it", async () => {
    const email = `upload-ok-${Date.now()}@example.com`;
    const headers = await signedInHeaders(email, "Uploader");

    const response = await POST(uploadRequest(headers, await pngFile()));
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
