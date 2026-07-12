import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { testImage } from "@/test/image-test-utils";
import { downscaleIfNeeded, MAX_DIMENSION_PX } from "./downscale";

describe("downscaleIfNeeded", () => {
  it("returns the exact input bytes when the image is within bounds", async () => {
    const original = await testImage("png", 1024, 768);
    const result = await downscaleIfNeeded(original, "image/png");
    expect(result.bytes).toBe(original);
    expect(result.contentType).toBe("image/png");
  });

  it("downscales an oversized image to fit 2048px, preserving aspect ratio", async () => {
    const original = await testImage("jpeg", 3000, 1500);
    const result = await downscaleIfNeeded(original, "image/jpeg");

    const meta = await sharp(Buffer.from(result.bytes)).metadata();
    expect(meta.width).toBe(MAX_DIMENSION_PX);
    expect(meta.height).toBe(1024);
    expect(meta.format).toBe("jpeg");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("downscales when only the height exceeds the bound", async () => {
    const original = await testImage("webp", 500, 2500);
    const result = await downscaleIfNeeded(original, "image/webp");

    const meta = await sharp(Buffer.from(result.bytes)).metadata();
    expect(meta.height).toBe(MAX_DIMENSION_PX);
    expect(meta.width).toBe(410); // 500 * 2048/2500, rounded
    expect(meta.format).toBe("webp");
  });
});
