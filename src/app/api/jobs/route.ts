import { db } from "@/db";
import { job } from "@/db/schema";
import { enqueueJob } from "@/jobs/queue";
import { getCurrentUser } from "@/lib/session";
import { sourceImageStorage } from "@/storage/source-images";

// Upload/Ingestion (spec.md): accept the image, store it as a Source Image,
// create the Job row, enqueue it, and return immediately — the client never
// blocks on pipeline completion. Only a basic is-it-an-image check here;
// the full upload constraints (formats, 10MB, resolution) are ticket 05.

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
  if (!image.type.startsWith("image/")) {
    return Response.json(
      { error: "the uploaded file must be an image" },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  const stored = await sourceImageStorage.upload(bytes, image.type);

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
