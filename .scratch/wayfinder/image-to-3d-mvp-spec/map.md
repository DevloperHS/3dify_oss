# Map: Image-to-3D MVP Spec

**Label:** wayfinder:map

## Destination

A written spec for the image-to-3D asset MVP — single uploaded image in, one downloadable/viewable
GLB asset out, async, multi-user production service — ready to hand to `/to-tickets`.

## Notes

Standing decisions locked while charting this map (not tickets — treat as fixed constraints for
every session working this map):

- **Scope:** single image in → one GLB asset out for MVP. Multi-image input and non-GLB export
  formats are out of scope (see below).
- **Users:** multi-user production service, not a personal tool.
- **Auth:** OAuth-only (Google at minimum) for MVP. No email/password.
- **Processing model:** async — upload returns a job immediately; a background worker processes
  it; client polls or receives a webhook/websocket update.
- **Pipeline stages:** Upload → Moderation → Preprocessing → Reconstruction → Postprocessing →
  Export/Storage. See `CONTEXT.md` for definitions.
- **Stack:** Next.js (frontend + API routes), Postgres (accounts/jobs/asset metadata), Redis +
  BullMQ (job queue), a separate worker process for Reconstruction (scales independently,
  GPU-capable).
- **Storage:** Cloudinary for Source Images — free tier: 25 credits/month pooled across
  storage/bandwidth/transforms, upgrade needed past ~20-25GB/month, no commercial-use restriction.
  Cloudflare R2 for generated GLB Assets — confirmed zero egress fees, free tier 10GB-month
  storage; **production serving requires a custom domain on the bucket**, not the rate-limited
  `r2.dev` dev subdomain. See ticket 02 (closed).
  **Amended 2026-07-12:** R2 requires a payment card on file even for its free tier, which the
  developer can't provide right now. Asset storage stays behind the same S3-compatible interface:
  **MinIO (docker-compose container) for local dev**, and **Backblaze B2 (10GB free, no card,
  S3-compatible, free egress via Cloudflare partnership) as the planned production target** — R2
  remains a drop-in option later if a card becomes available. Code-wise this was only an env-var
  generalization (`S3_ENDPOINT`/`S3_ACCESS_KEY_ID`/...), no interface change.
- **Reconstruction approach:** self-hosted TripoSR (primary), InstantMesh (fallback if fidelity
  disappoints in prototyping). Runs in the GPU-capable worker process. See ticket 01 (closed).
- **GPU compute — prototype vs. production split:** the developer's local 6GB GPU covers
  prototyping only (see ticket 04, closed). Production: **Modal**, serverless GPU with
  scale-to-zero, TripoSR packaged as a custom Modal function (not a one-click template anywhere).
  See ticket 05 (closed).
- **Output:** GLB only for MVP. In-browser 3D viewer required (e.g. `<model-viewer>`).
- **Persistence:** permanent asset library tied to the user's account. Source Images retained only
  as long as needed for a possible re-run, not indefinitely.
- **Billing:** out of scope for this spec. The account/job model must still support future usage
  metering (e.g. a jobs-per-user count exists) — no Stripe integration, plan tiers, or quota
  enforcement now.
- **Skills every session should consult:** `domain-modeling` (keep `CONTEXT.md` current as new
  terms crystallize), `codebase-design` (deep-module vocabulary when shaping pipeline-stage
  interfaces/seams).

## Decisions so far

- [01 — Research: image-to-3D reconstruction approach](tickets/01-research-reconstruction-approach.md) — self-hosted TripoSR (primary) / InstantMesh (fallback); sidesteps third-party data-handling entirely.
- [02 — Research: Cloudinary + Cloudflare R2 storage fit](tickets/02-research-storage-fit.md) — both providers go; R2 confirmed zero-egress but needs a custom domain for production (not `r2.dev`); Cloudinary fine to ~20-25GB/month combined usage.
- [04 — Task: provision a GPU environment for the reconstruction prototype](tickets/04-task-provision-gpu-environment.md) — no cloud rental needed, developer's local 6GB GPU meets TripoSR's requirement; production compute split out to ticket 05.
- [03 — Prototype: validate chosen reconstruction approach](tickets/03-prototype-validate-approach.md) — TripoSR works end-to-end (~20s on public rate-limited demo, not production-representative), output is a dense 41K-vertex mesh but **not watertight** and **vertex-colored, not UV-textured** — Postprocessing must repair/fill holes at minimum.
- [05 — Research: production GPU compute backend](tickets/05-research-production-gpu-compute.md) — **Modal** (serverless, scale-to-zero); RunPod Serverless runner-up; Replicate rejected (bills idle time); dedicated autoscaled instances rejected (no scale-to-zero, $384-942/mo running 24/7 unjustified pre-traffic).
- [06 — Grilling: upload constraints](tickets/06-grilling-upload-constraints.md) — JPEG/PNG/WebP only (no HEIC, client must convert); 10MB max file size (matches Cloudinary free-tier cap); hard-reject below 256×256px, downscale server-side above ~2048×2048px rather than reject.
- [07 — Grilling: failed-job handling](tickets/07-grilling-failed-job-handling.md) — failures tagged terminal/transient; transient gets 3 attempts via BullMQ exponential backoff from 10s, terminal gets zero; user sees a categorized failure reason (`failure_reason` column); only successful Jobs count toward future usage metering.
- [08 — Grilling: moderation provider](tickets/08-grilling-moderation-provider.md) — Cloudinary's built-in Amazon Rekognition AI Moderation add-on (no new cloud account needed); result delivered via webhook (`notification_url`) to a Next.js API route rather than polling.

## Not yet specified

- Non-functional targets: expected concurrency, jobs/day, latency SLA for the async pipeline —
  still genuinely too speculative pre-launch; revisit once real usage exists rather than guessing
  now.

## Map complete

All tickets closed — no open questions remain. Synthesized into [`spec.md`](spec.md) via
`/to-spec`. Seam analysis: Reconstruction is the only stage with a formal pluggable-adapter
interface (`ReconstructionEngine`, TripoSR primary / InstantMesh fallback); all other pipeline
stages are plain module boundaries. Next: `/to-tickets` against `spec.md` to break it into
tracer-bullet tickets under `.scratch/image-to-3d-mvp/issues/`.

## Out of scope

- Billing/monetization implementation (Stripe, plan tiers, quota enforcement) — only the
  metering-ready data model is in scope here; full billing is a future spec.
- Multi-image / photogrammetry input path.
- Non-GLB export formats (USDZ, OBJ, FBX) — future addition once core pipeline works.
- Email/password auth.
