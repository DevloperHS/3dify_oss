# Building Maker: From a Photo to a 3D Asset — a Handoff

*Last updated: 2026-07-12 · Repo state: tickets 01–02 shipped, ticket 03 next*

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

## Where to pick up: ticket 03

**`.scratch/image-to-3d-mvp/issues/03-real-reconstruction-triposr-modal.md`** — swap the stub for real TripoSR running as a Modal serverless GPU function (scale-to-zero). The contract: implement `ReconstructionEngine` calling Modal over HTTP, set a generous BullMQ job timeout (3–5 min, absorbs cold starts), and change *nothing* outside the reconstruction module. Prerequisite: a Modal account (GitHub sign-up, starter plan needs no card, $30/mo compute credit).

After that, the frontier in dependency order: 04 postprocessing (watertight repair — TripoSR meshes have holes), 05 upload constraints, 06 moderation, 07 failure handling, 08 asset library view, 09 source-image cleanup.

## Known debts, flagged on purpose

Carried in ticket notes so they don't get lost:

1. **Moderation bypass invariant** — the state machine's skip-ahead rule means `queued → reconstructing` is legal. Fine now; must be tightened when ticket 06 lands so no reconstruction compute ever runs before screening.
2. **Non-atomic Job transitions** — `processJob` reads status then writes; two concurrent workers could race. Revisit with ticket 07's retry work.
3. **Presigned URLs expire after 1h** — a stale job page past that shows a broken viewer until refresh. Production answer is custom-domain/CDN serving on the bucket, a deploy-time concern.
4. **Failure handling is a placeholder** — every worker error currently becomes a generic `"processing error"`. Terminal/transient categorization, retries with backoff, and metering rules are all specified (spec.md "Job orchestration") and land in ticket 07.
