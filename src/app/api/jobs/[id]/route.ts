import { eq } from "drizzle-orm";
import { db } from "@/db";
import { asset, job } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { assetStorage } from "@/storage/assets";

// Job-status transport (spec.md): the browser polls this while the Job is
// non-terminal. A missing job and another user's job are both 404 — no
// existence leak across accounts.

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser(request.headers);
  if (!user) {
    return Response.json({ error: "sign in required" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const [row] = await db.select().from(job).where(eq(job.id, id));
  if (!row || row.userId !== user.id) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }

  const body: {
    id: string;
    status: string;
    failureReason: string | null;
    createdAt: Date;
    asset?: { id: string; url: string; sizeBytes: number };
  } = {
    id: row.id,
    status: row.status,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  };

  if (row.status === "succeeded") {
    const [assetRow] = await db.select().from(asset).where(eq(asset.jobId, id));
    if (assetRow) {
      body.asset = {
        id: assetRow.id,
        url: await assetStorage.downloadUrl(assetRow.r2Key),
        sizeBytes: assetRow.sizeBytes,
      };
    }
  }

  return Response.json(body);
}
