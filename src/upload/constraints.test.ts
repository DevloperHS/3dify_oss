import { describe, expect, it } from "vitest";
import { fakeGifBytes, fakeHeicBytes, testImage } from "@/test/image-test-utils";
import { MAX_UPLOAD_BYTES, validateUpload } from "./constraints";

describe("validateUpload", () => {
  it("accepts JPEG, PNG, and WebP at valid dimensions", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const verdict = await validateUpload(await testImage(format, 300, 400));
      expect(verdict).toEqual({ ok: true, format, width: 300, height: 400 });
    }
  });

  it("rejects HEIC by name", async () => {
    const verdict = await validateUpload(fakeHeicBytes());
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toMatch(/HEIC/);
  });

  it("rejects GIF and names the accepted formats", async () => {
    const verdict = await validateUpload(fakeGifBytes());
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toMatch(/JPEG, PNG, or WebP/);
  });

  it("rejects unrecognizable bytes", async () => {
    const verdict = await validateUpload(new Uint8Array([1, 2, 3, 4, 5, 6]));
    expect(verdict.ok).toBe(false);
  });

  it("rejects files over 10MB before looking at content", async () => {
    const oversize = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    const verdict = await validateUpload(oversize);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toMatch(/10MB/);
  });

  it("rejects images under 256×256", async () => {
    const verdict = await validateUpload(await testImage("png", 255, 800));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.error).toMatch(/256/);
  });

  it("accepts images well above 2048px (downscaling is preprocessing's job)", async () => {
    const verdict = await validateUpload(await testImage("jpeg", 2500, 2500));
    expect(verdict.ok).toBe(true);
  });

  it("rejects a PNG-labelled file whose bytes are corrupt past the magic", async () => {
    const bytes = new Uint8Array(2048);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const verdict = await validateUpload(bytes);
    expect(verdict.ok).toBe(false);
  });
});
