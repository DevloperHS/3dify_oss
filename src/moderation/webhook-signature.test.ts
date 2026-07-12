import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCloudinarySignature } from "./webhook-signature";

const SECRET = "test-api-secret";

function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  return createHash("sha1").update(rawBody + timestamp + secret).digest("hex");
}

describe("verifyCloudinarySignature", () => {
  const rawBody = '{"notification_type":"moderation"}';
  const nowMs = 1_800_000_000_000;
  const timestamp = String(nowMs / 1000 - 60); // one minute old

  it("accepts a correctly signed, fresh notification", () => {
    expect(
      verifyCloudinarySignature({
        rawBody,
        timestamp,
        signature: sign(rawBody, timestamp),
        apiSecret: SECRET,
        nowMs,
      }),
    ).toBe(true);
  });

  it("rejects a wrong signature", () => {
    expect(
      verifyCloudinarySignature({
        rawBody,
        timestamp,
        signature: sign(rawBody, timestamp, "other-secret"),
        apiSecret: SECRET,
        nowMs,
      }),
    ).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyCloudinarySignature({
        rawBody: rawBody + "x",
        timestamp,
        signature: sign(rawBody, timestamp),
        apiSecret: SECRET,
        nowMs,
      }),
    ).toBe(false);
  });

  it("rejects a stale timestamp (replay window)", () => {
    const stale = String(nowMs / 1000 - 3 * 60 * 60);
    expect(
      verifyCloudinarySignature({
        rawBody,
        timestamp: stale,
        signature: sign(rawBody, stale),
        apiSecret: SECRET,
        nowMs,
      }),
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifyCloudinarySignature({
        rawBody,
        timestamp: null,
        signature: sign(rawBody, timestamp),
        apiSecret: SECRET,
        nowMs,
      }),
    ).toBe(false);
    expect(
      verifyCloudinarySignature({
        rawBody,
        timestamp,
        signature: null,
        apiSecret: SECRET,
        nowMs,
      }),
    ).toBe(false);
  });
});
