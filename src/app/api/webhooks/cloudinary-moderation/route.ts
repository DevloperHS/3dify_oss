import { db } from "@/db";
import { enqueueJob } from "@/jobs/queue";
import { handleModerationResult } from "@/moderation/gate";
import { verifyCloudinarySignature } from "@/moderation/webhook-signature";

// Cloudinary → server moderation webhook (spec.md "Moderation"): the aws_rek
// result arrives here via the upload's notification_url. Approval enqueues
// the Job (the worker advances it from `moderating`); rejection terminally
// fails it. Server-to-server, so authenticated by Cloudinary's notification
// signature, not a user session.

export async function POST(request: Request): Promise<Response> {
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiSecret) {
    return Response.json({ error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const authentic = verifyCloudinarySignature({
    rawBody,
    timestamp: request.headers.get("x-cld-timestamp"),
    signature: request.headers.get("x-cld-signature"),
    apiSecret,
  });
  if (!authentic) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: {
    notification_type?: string;
    moderation_status?: string;
    public_id?: string;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // Cloudinary sends other notification types (upload, eager, …) to the same
  // URL if configured broadly — acknowledge and ignore anything that isn't a
  // settled moderation verdict.
  if (
    payload.notification_type !== "moderation" ||
    !payload.public_id ||
    (payload.moderation_status !== "approved" &&
      payload.moderation_status !== "rejected")
  ) {
    return Response.json({ ignored: true });
  }

  const outcome = await handleModerationResult(
    db,
    {
      sourceImagePublicId: payload.public_id,
      status: payload.moderation_status,
    },
    enqueueJob,
  );
  return Response.json({ outcome });
}
