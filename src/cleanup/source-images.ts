import { and, inArray, isNull, lt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { job } from "@/db/schema";

// Source Image lifecycle (ticket 09, spec.md "Source Image lifecycle"): a
// Source Image is deleted 10 days after its Job reaches a terminal state,
// via a daily sweep. Terminal states have no exits, so the Job's updatedAt
// IS the moment it settled. The Asset (GLB) is a separate object in the
// asset store and is never touched here.
//
// Idempotent by construction: a deletion is recorded on the Job row
// (sourceImageDeletedAt), already-swept rows never match again, and an
// image Cloudinary has already lost ("not-found") still counts as deleted.

export const SOURCE_IMAGE_RETENTION_DAYS = 10;

export type SourceImageDeleter = {
  destroy(publicId: string): Promise<"deleted" | "not-found">;
};

export async function cleanupExpiredSourceImages(
  db: Db,
  deleter: SourceImageDeleter,
  now: Date = new Date(),
): Promise<{ swept: number }> {
  const cutoff = new Date(
    now.getTime() - SOURCE_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const expired = await db
    .select({ id: job.id, publicId: job.sourceImagePublicId })
    .from(job)
    .where(
      and(
        inArray(job.status, ["succeeded", "failed"]),
        lt(job.updatedAt, cutoff),
        isNull(job.sourceImageDeletedAt),
      ),
    );

  let swept = 0;
  const errors: Error[] = [];
  for (const row of expired) {
    // One poisoned image must not block the rows behind it — collect the
    // error, move on, and fail the run at the end so it's still visible.
    try {
      await deleter.destroy(row.publicId);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      continue;
    }
    // Deliberately does NOT bump updatedAt — that timestamp means "terminal
    // state reached" for this sweep's own cutoff.
    await db
      .update(job)
      .set({ sourceImageDeletedAt: now })
      .where(eq(job.id, row.id));
    swept++;
  }
  if (errors.length > 0) {
    throw new Error(
      `source-image sweep: ${errors.length} deletion(s) failed (${errors[0].message}); ${swept} swept`,
    );
  }
  return { swept };
}
