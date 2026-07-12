# Spec: Image-to-3D Asset MVP

**Status:** tickets published — see `.scratch/image-to-3d-mvp/issues/` (01–09, dependency order). Work the frontier with `/implement`, one ticket per session.

**Source:** synthesized from the `wayfinder` map at `map.md`, its closed tickets (01–08), and the domain glossary in `CONTEXT.md`. No new interview was conducted — this is pure synthesis of decisions already made.

---

## Problem Statement

Someone who wants a 3D digital asset of a physical object they own — for 3D printing, a game/AR/VR prop, or just to have a model of it — currently has to choose between: manual photogrammetry (many photos, specialized software, real skill), a paid commercial reconstruction API with per-generation cost and its own data-handling terms to evaluate, or wrestling with a research-grade open-source model on the command line with no account, no storage, and no way to come back to a result later. There is no simple product where someone uploads one photo of an object and later has a durable, viewable, downloadable 3D asset tied to their account.

## Solution

A production, multi-user web service. A user signs in with Google OAuth, uploads a single photo of an object, and the system does the rest asynchronously: the photo is screened, prepared, reconstructed into a 3D mesh by a self-hosted open-source model running on serverless GPU compute, cleaned up into a well-formed exportable mesh, and stored permanently as a GLB Asset in the user's library — viewable directly in the browser. The user never manages GPUs, models, or file formats; they upload a picture and get back a 3D object.

## User Stories

1. As a new visitor, I want to sign in with my Google account, so that I don't need to create and remember a new password for this service.
2. As a signed-in user, I want to upload a single photo of an object, so that I can turn it into a 3D asset.
3. As a signed-in user, I want to be told immediately my upload was accepted (not blocked waiting for reconstruction to finish), so that I can leave the page and come back later.
4. As a signed-in user, I want my upload rejected up front if it's not a JPEG, PNG, or WebP file, so that I know immediately my file won't work rather than finding out after a long wait.
5. As a signed-in user photographing an object on my iPhone, I want a clear error telling me HEIC isn't supported, so that I know to re-export or re-share the photo as JPEG before retrying.
6. As a signed-in user, I want my upload rejected if it exceeds 10MB, so that I get fast, predictable feedback instead of a silent failure deep in the pipeline.
7. As a signed-in user, I want my upload rejected if the image is too small (under 256×256px) to reconstruct anything meaningful, so that I don't waste time waiting on a Job that was doomed from the start.
8. As a signed-in user uploading an unusually high-resolution photo, I want it automatically downscaled rather than rejected, so that a great photo I took isn't blocked on a technicality.
9. As a signed-in user, I want my photo screened for inappropriate content before any reconstruction compute is spent on it, so that the service isn't used to process content it shouldn't process.
10. As a signed-in user whose image is rejected by moderation, I want to be told why (in general terms), so that I understand it wasn't a bug and I know not to just retry the same image.
11. As a signed-in user, I want to see my Job's current stage (e.g. moderating, reconstructing) while it's processing, so that I know it's actively working and roughly how far along it is.
12. As a signed-in user, I want to be notified when my Job finishes successfully, so that I know my Asset is ready without having to keep the tab open and refreshing.
13. As a signed-in user whose Job fails due to a transient infrastructure issue, I want the system to automatically retry a bounded number of times before giving up, so that I'm not bothered by failures I didn't cause and could not have prevented.
14. As a signed-in user whose Job ultimately fails, I want a clear, categorized reason (e.g. "processing error, please retry" vs. "rejected: content moderation"), so that I know whether retrying with the same image is worth attempting.
15. As a signed-in user, I want my successfully generated Assets to persist permanently in my account's library, so that I can come back weeks later and still find them.
16. As a signed-in user, I want to view a generated Asset directly in the browser (rotate/zoom a 3D model), so that I can inspect the result without downloading anything or installing separate 3D software.
17. As a signed-in user, I want to download the GLB file of a generated Asset, so that I can use it in other tools (3D printing slicers, game engines, etc.).
18. As a signed-in user, I want my uploaded source photo retained only as long as it's useful (e.g. to support a possible re-run), not indefinitely, so that my original photos aren't stored forever without reason.
19. As a signed-in user, I want a mesh that is watertight (no holes) in the Asset I download, so that it's actually usable for downstream purposes like 3D printing that require a closed surface.
20. As a signed-in user, I want the 3D viewer to correctly render my Asset's color even though the underlying mesh uses per-vertex color rather than a texture map, so that the object looks like what I photographed.
21. As the service operator, I want every Job's outcome (success, terminal failure, transient failure exhausted after retries) recorded with enough detail to debug issues, so that I can diagnose problems without asking users to reproduce them.
22. As the service operator, I want only successfully completed Jobs to count toward a future usage-metering figure, so that users are never billed (once billing exists) for failures that were the service's fault or were blocked pre-compute by moderation.
23. As the service operator, I want the Reconstruction step to run on serverless, scale-to-zero GPU compute, so that the service isn't paying for idle GPU capacity before there's meaningful traffic.
24. As the service operator, I want the Reconstruction step isolated behind a swappable interface, so that I can fall back to a different open-source model (InstantMesh) later without having to change any other pipeline stage.
25. As the service operator, I want generated GLB Assets stored with zero egress fees at scale, so that serving a growing asset library doesn't create runaway bandwidth costs.
26. As the service operator, I want the account/Job data model to already support a future per-user Job count, so that usage metering can be added later without a schema migration that touches every existing row.
27. As a signed-in user, I want to be able to see my past Jobs (not just my completed Assets), including failed ones and their reasons, so that I have a complete history of what I've tried.

## Implementation Decisions

### Pipeline stages and module boundaries

The pipeline (`Upload → Moderation → Preprocessing → Reconstruction → Postprocessing → Export/Storage`, per `CONTEXT.md`) is implemented as a sequence of deep modules, each with clear inputs/outputs. Per the seam analysis agreed with the user: **only Reconstruction gets a formal pluggable-adapter interface** (two real, already-decided backends exist: TripoSR and InstantMesh). The other stages are plain module boundaries — a single current implementation each, not built as speculative pluggable abstractions.

- **Upload/Ingestion.** Validates the incoming file against upload constraints (below), stores the Source Image to Cloudinary, creates a Job row, enqueues the Job onto the Redis/BullMQ queue, and returns the Job identifier to the client immediately (the client never blocks on pipeline completion).
- **Moderation.** A plain module wrapping Cloudinary's built-in Amazon Rekognition AI Moderation add-on (`moderation: aws_rek`), applied automatically to the Source Image already stored in Cloudinary — no separate cloud account or SDK integration. The moderation result is delivered asynchronously via Cloudinary's `notification_url` webhook to a Next.js API route, which updates the Job's state: advance to Preprocessing on a pass, or mark the Job terminally failed (`failure_category: terminal`, `failure_reason: content moderation`) on a rejection.
- **Preprocessing.** Owns two responsibilities before Reconstruction proper: (1) server-side downscaling of any Source Image above ~2048×2048px (no rejection at the high end — TripoSR gains nothing from resolution beyond its own internal working resolution, confirmed by the prototype's `/preprocess` step); (2) invoking background removal / foreground framing, which — per the prototype's confirmed API shape — is itself a distinct call (`/preprocess`, ~7s in the prototype) ahead of the reconstruction call proper. This stage owns that call.
- **Reconstruction.** The one real seam: a `ReconstructionEngine` interface with a single method taking a preprocessed image and returning a raw mesh (vertex-colored, not watertight — known, accepted characteristics of the primary implementation). **TripoSR** is the primary implementation; **InstantMesh** is the fallback implementation behind the same interface, swapped in only if TripoSR's fidelity disappoints in real usage (per ticket 01/03's findings — no evidence of that yet; the prototype validated TripoSR's output quality as acceptable). The engine runs inside a **Modal** serverless GPU function (`@app.function(gpu=...)`, scale-to-zero by default, per-second billing), invoked over HTTP from the BullMQ worker process. Given cold starts are tolerable in this async architecture (research finding: 10–30s of cold start is invisible to a user who's already watching a "processing" state, not blocked on an open HTTP request), the BullMQ job timeout for this stage is set generously (3–5 minutes) rather than tuned to a synchronous-caller's tight budget.
- **Postprocessing.** Required (not optional) mesh-repair/hole-filling step — confirmed necessary by the prototype, since TripoSR's raw output is not watertight. Exports the repaired mesh to GLB. UV-unwrapping is explicitly not built for the MVP (vertex colors are sufficient for the chosen viewer and GLB consumers); it becomes necessary only if a future export target requires a texture map instead.
- **Export/Storage.** Uploads the finished GLB to Cloudflare R2 (served from a custom domain on the bucket — the rate-limited `r2.dev` subdomain is not used in production), creates an Asset row linking the file to the owning User and the source Job, and marks the Job `succeeded`.

### Job orchestration (cross-cutting deep module)

A `Job` state machine spans every pipeline stage above; it is treated as its own deep module rather than folded into any one stage, since its rules (below) are substantial enough to be tested and reasoned about independently.

- **States:** queued → moderating → preprocessing → reconstructing → postprocessing → exporting → succeeded, with a `failed` terminal state reachable from any stage.
- **Failure categorization.** Every failure is tagged `terminal` or `transient` at the point it's raised. Moderation rejection is always terminal. A Modal cold-start/timeout is transient. Ambiguous Reconstruction errors (e.g. the engine can't find a usable foreground subject) are judged case-by-case at implementation time — not resolved generically by this spec.
- **Retry policy.** Transient failures get 3 total attempts (1 original + 2 retries) via BullMQ's built-in retry mechanism, exponential backoff starting at 10s (10s, then 20s). Terminal failures get zero retries and fail immediately.
- **Failure surfacing.** Every Job carries a `failure_reason` (short, categorized, user-facing string — no internal detail such as stack traces or provider names) alongside its terminal `failed` status.
- **Metering readiness.** Only Jobs that reach `succeeded` count toward any future per-user usage figure. Failed Jobs never count, whether terminal or transient-exhausted, even if GPU compute was spent chasing a transient failure before giving up. No billing/quota enforcement exists yet — this is a counting rule the schema must support, not an enforced limit.

### Upload constraints

- **Accepted formats:** JPEG, PNG, WebP only. HEIC is rejected at upload with no server-side conversion; the client is responsible for converting/exporting HEIC to an accepted format before uploading.
- **Max file size:** 10MB — matches Cloudinary's free-plan hard cap for image uploads, so the app-level limit is set no stricter than the platform already enforces.
- **Resolution:** hard-rejected below 256×256px. No hard maximum — anything above ~2048×2048px is downscaled server-side during Preprocessing rather than rejected.

### Data model

- **User/Account** — Google OAuth identity.
- **Job** — one row per submitted Source Image: current pipeline state, `failure_category`, `failure_reason`, retry count, owning User, reference to the Source Image (Cloudinary URL/public ID), timestamps. Structured so a future "successful Jobs for user X" count is a simple filtered query, not a schema change.
- **Asset** — one row per successfully completed Job: GLB file location (R2), owning User, reference back to the source Job, created-at timestamp. Permanent, part of the user's library.

### Job-status transport

The backend-to-browser leg of status updates uses **client-side polling**: the Job status page polls `GET /api/jobs/:id` every 2-3 seconds while the Job is in a non-terminal state, and stops once it reaches `succeeded` or `failed`. This needs no new infrastructure (no websocket/SSE server, no third-party push service) and fits Next.js API routes' stateless request/response model directly — a few seconds of polling delay is imperceptible against Jobs that already take tens of seconds to complete. This is distinct from the webhooks already used earlier in the pipeline (Cloudinary → Next.js API route for moderation results): those are server-to-server, addressable because both ends are real servers; the browser has no public address for a webhook to target, so its leg is necessarily polling or a held-open connection.

### Source Image lifecycle

A Source Image is deleted **10 days after its Job reaches a terminal state** (`succeeded` or `failed`), via a scheduled cleanup job (a daily sweep over Jobs past their window) — not tied to any user action. This gives a practical window for a user to trigger a re-run against the same photo without holding every uploaded image indefinitely, and keeps usage within Cloudinary's pooled free-tier storage/bandwidth/transform budget. The Asset (GLB) is unaffected by Source Image deletion — it's a separate, permanent object in R2 that doesn't reference the Source Image at read time.

### Stack (carried over from the map, restated here for completeness)

Next.js (frontend + API routes) · Postgres (accounts/Jobs/Assets) · Redis + BullMQ (job queue) · a separate GPU-capable worker process for Reconstruction, running on Modal · Cloudinary (Source Image storage + Moderation add-on) · Cloudflare R2 (Asset storage) · `<model-viewer>` (or equivalent) for in-browser GLB viewing.

## Testing Decisions

- **Test external behavior at each module's seam, not internal implementation.** E.g. for Upload/Ingestion: assert that an oversized file, wrong format, or under-resolution image is rejected with the correct categorized error — not that a specific internal validator function was called.
- **The Job state machine is the highest-value target for pure unit tests.** It is deterministic and has no external I/O, and it encodes all of ticket 07's failure/retry/notification/metering rules (terminal vs. transient classification, retry count and backoff, `failure_reason` surfacing, the "only successful Jobs count" metering rule). This module should have the most thorough test coverage in the codebase, since it's where the most explicit business rules live.
- **Reconstruction is tested against the `ReconstructionEngine` interface using a fake/stub implementation** in pipeline-level tests. Real-model behavior (TripoSR/InstantMesh output quality on Modal) is validated manually via the `prototype` skill's workflow (as ticket 03 already did), not via automated CI tests — GPU inference against a real model is not something CI should be asserting exact output against.
- **Moderation and Export/Storage are tested via contract/integration tests against recorded fixtures** — a fixture Cloudinary moderation webhook payload (pass and reject cases) drives the Moderation module's tests; a stubbed/mocked R2 client drives the Export/Storage module's tests. Neither hits live Cloudinary/R2 in CI.
- **No prior art exists yet** — this is a greenfield codebase. These decisions establish the testing pattern going forward (seam-level tests over implementation-detail tests, consistent with the `codebase-design` skill's vocabulary) for all future work on this project.

## Out of Scope

- Billing/monetization (Stripe integration, plan tiers, quota enforcement) — only the metering-ready data model (successful-Job counting) is in scope.
- Multi-image / photogrammetry input.
- Non-GLB export formats (USDZ, OBJ, FBX).
- Email/password authentication.
- HEIC upload support.
- UV-unwrapping / texture-map export (vertex colors are sufficient for MVP; revisit only if a future export target requires it).
- Non-functional targets (expected concurrency, jobs/day, latency SLA) — still genuinely too speculative pre-launch, per the map; revisit once real usage exists.

## Further Notes

- **Storage amendment (2026-07-12, post-spec):** Cloudflare R2 requires a payment card even on
  the free tier, which isn't currently available. The Export/Storage stage is unchanged in shape
  but points at any S3-compatible store via env vars: MinIO (local docker-compose container) for
  dev, Backblaze B2 (10GB free, no card, free egress via Cloudflare partnership) as the planned
  production target, with R2 still a drop-in later. References to R2 elsewhere in this spec should
  be read as "the configured S3-compatible asset store".

- Two research documents backing the Reconstruction and GPU-compute decisions (`research/01-reconstruction-approach.md`, `research/05-production-gpu-compute.md`) contain some figures the researcher explicitly flagged as unverified against a primary source (e.g. exact AWS/GCP GPU on-demand pricing, some Tripo3D/Stability API figures). None of these affect the decisions actually made (TripoSR self-hosted on Modal), since those were the confidently-sourced conclusions — the flagged figures relate to alternatives that were not chosen. Worth a fresh check only if either decision is ever revisited.
- The classification of ambiguous Reconstruction-stage errors as terminal vs. transient (ticket 07) is deliberately left to implementation time rather than enumerated here, since the real failure modes will only be fully known once the Reconstruction engine is running against real, varied user uploads.
