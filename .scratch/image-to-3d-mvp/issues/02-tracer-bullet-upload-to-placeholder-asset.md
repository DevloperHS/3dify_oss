# 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end

**What to build:** A signed-in user uploads a photo, watches their Job's progress, and ends up with a viewable/downloadable GLB Asset — proving the entire pipeline skeleton (Upload/Ingestion, Job queue, Reconstruction seam, Export/Storage, status polling, viewer) works end-to-end, using a stub `ReconstructionEngine` that returns a fixed placeholder mesh instead of a real model. Real Reconstruction lands in ticket 03 with no changes needed to anything built here.

**Blocked by:** 01 — Auth: Google OAuth sign-in

**Status:** ready-for-agent

- [ ] Signed-in user can upload an image file via a form
- [ ] Upload creates a Job row (owned by the user) and enqueues it on BullMQ, returning immediately without blocking on pipeline completion
- [ ] Source Image is stored in Cloudinary
- [ ] Worker picks up the Job and calls a stub `ReconstructionEngine` implementation that returns a fixed placeholder mesh
- [ ] Placeholder GLB is uploaded to Cloudflare R2 and an Asset row is created linking it to the Job and the owning User
- [ ] Job transitions through queued → reconstructing → exporting → succeeded, and the frontend reflects each state by polling `GET /api/jobs/:id` every 2-3 seconds while non-terminal, stopping on success/failure
- [ ] Once succeeded, the user can view the placeholder GLB in-browser via a 3D viewer and download the file
- [ ] The `ReconstructionEngine` call site is behind an interface, not a hardcoded inline call — ready for ticket 03 to swap in a real implementation with no other pipeline stage touched
