# Building Maker: From a Photo to a 3D Asset — a Handoff

*Last updated: 2026-07-12 (evening autonomous run) · Repo state: tickets 01–09 all implemented; Modal deploy + live-service verification pending human (see `build_docs/needs-human.md`)*

Maker is a web service that turns a single photo of an object into a downloadable, browser-viewable 3D asset (GLB). You sign in with Google, upload a picture, and a pipeline does the rest asynchronously — screening, preprocessing, AI reconstruction, mesh cleanup, and storage into your permanent asset library.

This post is the handoff: how the project is structured, what's built and verified so far, the decisions that got us here, and exactly where the next contributor (human or agent) should pick up.

## How this project is run

Everything is driven by a spec-first, ticket-based workflow (the mattpocock skills set: `wayfinder` → `to-spec` → `to-tickets` → `implement`). The paper trail lives in the repo:

| Artifact | Path |
|---|---|
| Domain glossary | `CONTEXT.md` |
| Discovery map + closed research/decision tickets | `.scratch/wayfinder/image-to-3d-mvp-spec/` |
| The spec (source of truth) | `.scratch/wayfinder/image-to-3d-mvp-spec/spec.md` |
| Implementation tickets 01–09 | `.scratch/image-to-3d-mvp/issues/` |

The rule of engagement: work the ticket frontier one ticket per fresh session with `/implement`, close each ticket in its file, and record any decision changes back into the map and spec. Read `spec.md` before writing code — it explains *why* everything below is shaped the way it is.

One repo-level gotcha, straight from `AGENTS.md`: **this is Next.js 16 and it is not the Next.js you remember.** `params` is a `Promise` in route handlers and pages, Turbopack is the default bundler. Check `node_modules/next/dist/docs/` before assuming an API exists.

## The architecture in one diagram

```
Browser ──POST /api/jobs──▶ Next.js API route
  │                           │  1. store Source Image → Cloudinary
  │                           │  2. insert Job row → Postgres
  │                           │  3. enqueue { jobId } → Redis/BullMQ
  │                           └─ returns 201 immediately
  │
  │ polls GET /api/jobs/:id every 2.5s
  │
  ▼                         Worker process (pnpm worker)
<model-viewer> ◀─presigned── │  queued → reconstructing → exporting → succeeded
 + download      URL         │       │            │
                             │  ReconstructionEngine   S3-compatible store
                             │  (stub cube today,      (MinIO dev / B2 prod)
                             │   TripoSR next)         + Asset row → Postgres
```

**Stack:** Next.js 16 (App Router) · Postgres + Drizzle · Redis + BullMQ · Better Auth (Google OAuth only) · Cloudinary (source images) · any S3-compatible store (generated GLBs) · `<model-viewer>` for in-browser 3D.

## The one deliberate seam

A design decision worth understanding before touching anything: **only Reconstruction has a formal pluggable interface.** Every other pipeline stage (moderation, preprocessing, postprocessing, export) is a plain module boundary with a single implementation.

```ts
// src/reconstruction/engine.ts
export interface ReconstructionEngine {
  reconstruct(input: ReconstructionInput): Promise<ReconstructionResult>;
}
```

Why only this one? The codebase-design heuristic we follow: *one adapter is a hypothetical seam; two adapters make it real.* Reconstruction has two real, already-decided implementations — self-hosted **TripoSR** (primary) and **InstantMesh** (fallback) — so it earned the interface. Nothing else did, so nothing else got speculative abstraction.

Today the interface is served by `StubReconstructionEngine`, which emits a vertex-colored cube GLB built byte-by-byte in TypeScript (`src/reconstruction/stub-engine.ts`). The stub deliberately mirrors real TripoSR output characteristics — vertex colors, no UV texture — so the viewer and export path proven against the stub stay valid when the real engine lands.

## The Job state machine

Cross-cutting all stages is a pure, I/O-free state machine (`src/jobs/state-machine.ts`) — deliberately the most heavily unit-tested module, because it's where the business rules live:

```
queued → moderating → preprocessing → reconstructing → postprocessing → exporting → succeeded
                                    (failed reachable from any non-terminal state)
```

Rules encoded: transitions are forward-only; unbuilt stages may be skipped; terminal states (`succeeded`, `failed`) have no exits. The Postgres `job_status` enum is generated from the machine's `JOB_STATUSES` array — one source of truth, no schema migration when later tickets activate the middle stages.

## What's shipped and verified

**Ticket 01 — Google OAuth** (commits up to `53c632a`). Better Auth + Drizzle adapter, `user`/`session`/`account` tables, sign-in/out UI. Tests create real sessions against a test database via an email/password test-only auth instance — indistinguishable at the DB level from OAuth sessions, no live Google round-trip needed.

**Ticket 02 — the tracer bullet** (commits `234f731`, `30d1252`, `1de2349`). A signed-in user uploads a photo and ends up with a viewable, downloadable GLB — through every real layer: multipart upload → Cloudinary → Job row → BullMQ → worker → stub engine → S3 store → Asset row → polling UI → `<model-viewer>`. 31 tests, all seam-level: the state machine exhaustively, the worker pipeline against the test DB with fakes, the API routes with real auth sessions and mocked storage. **Verified live end-to-end on 2026-07-12.**

**The storage swap** (commit `2e62d7c`). The spec originally chose Cloudflare R2 for GLB storage (zero egress fees). R2's free tier turned out to require a payment card, which wasn't available — so the storage module was generalized to plain S3 env vars (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`), and docker-compose gained a MinIO container plus a one-shot bucket-init job. **MinIO serves local dev; Backblaze B2 (10GB free, no card, free egress via the Cloudflare partnership) is the planned production target; R2 remains a drop-in.** The amendment is recorded in both the map and the spec. Round-trip verified: upload → presign → fetch, bytes identical.

## Running it locally

```bash
docker compose up -d     # Postgres, Redis, MinIO (+ bucket init)
pnpm db:push             # sync Drizzle schema
pnpm dev                 # Next.js on :3000
pnpm worker              # BullMQ worker, separate terminal
```

`.env` needs (see `.env.example`): Postgres/Redis URLs (compose defaults), a Better Auth secret, Google OAuth client credentials, Cloudinary credentials, and the S3 vars (MinIO defaults work out of the box). The MinIO console is at `localhost:9001` (`minioadmin`/`minioadmin`).

Verification commands: `pnpm typecheck`, `pnpm test` (needs docker up — tests hit a real `maker_test` database), `pnpm build`.

## The 2026-07-12 autonomous run: tickets 03–09

All implementation tickets are now done (each closed in its file with notes; one commit per ticket):

- **03 — TripoSR on Modal** (`d40b78e`, `e092e79`): `modal/triposr_app.py` (T4, baked weights, proxy auth, scale-to-zero) + `ModalReconstructionEngine` with a 4-min HTTP timeout standing in for BullMQ's nonexistent per-job timeout. Engine selection via `RECONSTRUCTION_ENGINE` (modal default, stub opt-out). **Deploy + live mesh still pending a Modal account.**
- **04 — Watertight repair** (`97ce8fe`): pure-TS boundary-loop capping on `@gltf-transform/core`; verified against the prototype's real TripoSR chair mesh; open meshes can't reach storage.
- **05 — Upload constraints** (`aaeeb4b`): magic-byte format sniffing (HEIC named), 10MB cap, ≥256×256; >2048px downscaled in a new worker Preprocessing stage (sharp).
- **06 — Moderation gate** (`bcf5d0c`): Cloudinary aws_rek via signature-verified webhook; moderated jobs only reach the queue through approval. **Behind `MODERATION_ENABLED` until the add-on is activated on the account.**
- **07 — Failure handling** (`2f8a48b`): `PipelineFailure` terminal/transient tagging at raise points, BullMQ 3 attempts + exponential backoff, `UnrecoverableError` for terminal, retry-reentrant `processJob`, `succeededJobCount` metering query.
- **08 — Library view** (`a98109e`): `/library` server component; Assets + full Job history, user-scoped queries.
- **09 — Source-image retention** (`e41e331`): daily BullMQ-scheduled sweep deleting Cloudinary images of jobs terminal >10 days; idempotent via `source_image_deleted_at`.

**Where to pick up: `build_docs/needs-human.md`** — the ordered checklist of everything that needs the human (Modal auth + deploy, Cloudinary add-on, live end-to-end runs).

## Known debts, flagged on purpose

1. ~~Moderation bypass invariant~~ — closed for the moderated path (ticket 06: jobs only enter the queue post-approval). With `MODERATION_ENABLED=false` the skip is deliberate.
2. **Non-atomic Job transitions** — `processJob` reads status then writes; two concurrent workers could race. Unchanged; BullMQ's per-job-id keying makes it unlikely today.
3. **Presigned URLs expire after 1h** — stale job/library pages show broken viewer/download links until refresh. Production answer is custom-domain/CDN serving on the bucket.
4. ~~Failure handling placeholder~~ — closed by ticket 07.
5. **Stuck `moderating` jobs** (new, found in review) — if Cloudinary's moderation webhook never arrives, the job sits in `moderating` forever: no timeout/reaper, and the retention sweep only matches terminal jobs, so its source image is never cleaned up either. Needs a product decision (fail after N hours? re-poll Cloudinary?) before moderation goes live.
6. **Preprocessing ownership deviation** (documented in ticket 05) — spec.md says the Preprocessing stage owns the background-removal call; in practice rembg runs inside the Modal TripoSR function. Fine until an engine that doesn't bundle it appears.
