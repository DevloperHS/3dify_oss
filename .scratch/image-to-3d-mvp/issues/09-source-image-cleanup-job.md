# 09 — Source Image cleanup job

**What to build:** Source Images are automatically deleted from Cloudinary 10 days after their Job reaches a terminal state, via a scheduled sweep — keeping storage usage bounded without affecting the permanent Asset library.

**Blocked by:** 07 — Failed-job handling: retries, terminal/transient classification, failure_reason

**Status:** closed (2026-07-12)

- [x] A scheduled job runs daily (BullMQ job scheduler, `0 3 * * *`, separate `maintenance` queue consumed by the same worker process) and finds Jobs terminal for >10 days — terminal states have no exits, so `updatedAt` is the settle time
- [x] For each such Job, its Source Image is deleted from Cloudinary (`sourceImageStorage.destroy`; sweep logic in `src/cleanup/source-images.ts`)
- [x] Jobs still within the 10-day window are left untouched (asserted; non-terminal old jobs too)
- [x] Deleting a Source Image does not affect the corresponding Asset (asserted — sweep never touches asset rows or the asset store)
- [x] Running the sweep twice is safe — deletion is recorded as `job.source_image_deleted_at` (new column, pushed to dev+test DBs) so swept rows never match again, and Cloudinary's "not found" counts as swept

**Implementation notes (2026-07-12):** the sweep deliberately does not bump
`updatedAt` (that timestamp means "terminal state reached" for its own
cutoff). Worker boot verified live: both queues listening, scheduler
upserted. Live Cloudinary destroy is exercised only once real uploads age
past 10 days — nothing to see before ~2026-07-22.
