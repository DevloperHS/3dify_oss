import { db } from "@/db";
import { job } from "@/db/schema";
import { enqueueJob } from "@/jobs/queue";
import { getCurrentUser } from "@/lib/session";
import { sourceImageStorage } from "@/storage/source-images";
import { validateUpload } from "@/upload/constraints";

// Upload/Ingestion (spec.md): validate the image against the upload
// constraints (JPEG/PNG/WebP, ≤10MB, ≥256×256 — ticket 05), store it as a
// Source Image, create the Job row, enqueue it, and return immediately — the
// client never blocks on pipeline completion.

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser(request.headers);
  if (!user) {
    return Response.json({ error: "sign in required" }, { status: 401 });
  }

  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return Response.json({ error: "an image file is required" }, { status: 400 });
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  // Constraints run before any storage or Job row exists — a rejected upload
  // leaves no trace.
  const verdict = await validateUpload(bytes);
  if (!verdict.ok) {
    return Response.json({ error: verdict.error }, { status: 400 });
  }

  const stored = await sourceImageStorage.upload(bytes, `image/${verdict.format}`);

  const jobId = crypto.randomUUID();
  await db.insert(job).values({
    id: jobId,
    userId: user.id,
    sourceImageUrl: stored.url,
    sourceImagePublicId: stored.publicId,
  });
  await enqueueJob(jobId);

  return Response.json({ id: jobId, status: "queued" }, { status: 201 });
}
