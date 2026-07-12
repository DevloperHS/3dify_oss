# 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end

**What to build:** A signed-in user uploads a photo, watches their Job's progress, and ends up with a viewable/downloadable GLB Asset — proving the entire pipeline skeleton (Upload/Ingestion, Job queue, Reconstruction seam, Export/Storage, status polling, viewer) works end-to-end, using a stub `ReconstructionEngine` that returns a fixed placeholder mesh instead of a real model. Real Reconstruction lands in ticket 03 with no changes needed to anything built here.

**Blocked by:** 01 — Auth: Google OAuth sign-in

**Status:** done — commits 234f731 (implementation) + 30d1252 (review fixes)

- [x] Signed-in user can upload an image file via a form
- [x] Upload creates a Job row (owned by the user) and enqueues it on BullMQ, returning immediately without blocking on pipeline completion
- [x] Source Image is stored in Cloudinary
- [x] Worker picks up the Job and calls a stub `ReconstructionEngine` implementation that returns a fixed placeholder mesh
- [x] Placeholder GLB is uploaded to Cloudflare R2 and an Asset row is created linking it to the Job and the owning User
- [x] Job transitions through queued → reconstructing → exporting → succeeded, and the frontend reflects each state by polling `GET /api/jobs/:id` every 2-3 seconds while non-terminal, stopping on success/failure
- [x] Once succeeded, the user can view the placeholder GLB in-browser via a 3D viewer and download the file
- [x] The `ReconstructionEngine` call site is behind an interface, not a hardcoded inline call — ready for ticket 03 to swap in a real implementation with no other pipeline stage touched

## Notes from implementation + review

- The stub engine emits a vertex-colored cube GLB built in TypeScript (`src/reconstruction/stub-engine.ts`) — vertex colors, no texture, mirroring real TripoSR output shape so the viewer path stays valid for ticket 03.
- The worker runs via `pnpm worker` (tsx). Local demo needs `docker compose up -d`, real Cloudinary + R2 credentials in `.env` (see `.env.example`), `pnpm dev`, and `pnpm worker` in a second terminal.
- Review flags carried forward:
  - **Ticket 06 (moderation):** the state machine allows skipping unbuilt stages (`queued → reconstructing`). Once Moderation lands, tighten it so reconstruction is unreachable without a moderation pass — user story 9 says no reconstruction compute before screening.
  - **Ticket 07 (failure handling):** `processJob`'s status transitions are read-then-write, not atomic; fine single-worker, revisit alongside retries.
  - Asset downloads use 1-hour presigned R2 URLs for now; production custom-domain serving (per spec Export/Storage) is a deploy-time follow-up.
