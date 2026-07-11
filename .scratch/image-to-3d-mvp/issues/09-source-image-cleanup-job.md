# 09 — Source Image cleanup job

**What to build:** Source Images are automatically deleted from Cloudinary 10 days after their Job reaches a terminal state, via a scheduled sweep — keeping storage usage bounded without affecting the permanent Asset library.

**Blocked by:** 07 — Failed-job handling: retries, terminal/transient classification, failure_reason

**Status:** ready-for-agent

- [ ] A scheduled job runs at least daily and finds Jobs whose terminal state (`succeeded` or `failed`) was reached more than 10 days ago
- [ ] For each such Job, its Source Image is deleted from Cloudinary
- [ ] Jobs still within the 10-day window are left untouched
- [ ] Deleting a Source Image does not affect the corresponding Asset (GLB in R2) — it remains fully viewable/downloadable
- [ ] Running the cleanup job twice in a row against the same data is safe (idempotent — doesn't error on an already-deleted Source Image)
