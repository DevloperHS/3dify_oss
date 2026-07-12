import { createHash, timingSafeEqual } from "node:crypto";

// Cloudinary notification authenticity check (spec.md "Moderation"): every
// webhook carries X-Cld-Signature = SHA-1(body + timestamp + api_secret) and
// X-Cld-Timestamp. Verified with the same shared secret the upload API uses —
// no extra credentials.

const MAX_AGE_SECONDS = 2 * 60 * 60;

export function verifyCloudinarySignature(options: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  apiSecret: string;
  nowMs?: number;
}): boolean {
  const { rawBody, timestamp, signature, apiSecret, nowMs = Date.now() } = options;
  if (!timestamp || !signature) return false;

  const age = nowMs / 1000 - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_SECONDS) return false;

  const expected = createHash("sha1")
    .update(rawBody + timestamp + apiSecret)
    .digest("hex");
  const provided = Buffer.from(signature, "hex");
  const wanted = Buffer.from(expected, "hex");
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
