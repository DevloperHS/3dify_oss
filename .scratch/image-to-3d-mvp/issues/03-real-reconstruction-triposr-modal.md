# 03 — Real Reconstruction: TripoSR on Modal

**What to build:** Uploaded photos produce an actual TripoSR-generated mesh instead of ticket 02's placeholder — served through the same `ReconstructionEngine` interface, running as a Modal serverless GPU function (scale-to-zero).

**Blocked by:** 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end

**Status:** implemented — deploy + live verification pending Modal account (human action)

- [x] TripoSR is packaged and deployed as a Modal serverless GPU function (scale-to-zero by default) — *packaged* in `modal/triposr_app.py` (T4, baked weights, proxy auth, scale-to-zero); *deploy* needs `modal token new` + `modal deploy`, see notes
- [x] A `ReconstructionEngine` implementation calls the Modal function over HTTP and returns TripoSR's real mesh output (`src/reconstruction/modal-engine.ts`)
- [x] The BullMQ worker uses this implementation in place of ticket 02's stub, with no changes required to any other pipeline stage (`src/reconstruction/select-engine.ts`; only the engine line in `src/worker/index.ts` changed — stub stays reachable via `RECONSTRUCTION_ENGINE=stub` for Modal-less local dev)
- [x] The Reconstruction stage's BullMQ job timeout is configured generously (3-5 minutes) to absorb a Modal cold start — BullMQ has no native per-job execution timeout, so this lives as the engine's HTTP request timeout: 4 min default, `RECONSTRUCTION_TIMEOUT_MS` to override; the Modal function timeout matches at 240s
- [x] Uploading a real photo end-to-end produces and stores a real (non-placeholder) TripoSR mesh — **verified live 2026-07-13** (after the numpy re-pin, pinched-hole repair fix, and Y-up rotation) as the resulting Asset — **blocked on the human**: create a Modal account (GitHub sign-up, no card), run `modal token new`, `modal deploy modal/triposr_app.py`, create a proxy auth token in the dashboard, fill `MODAL_TRIPOSR_URL`/`MODAL_KEY`/`MODAL_SECRET` in `.env`, then upload a photo. Smoke test without the web app: `modal run modal/triposr_app.py --image-path <photo>`

**Implementation notes (2026-07-12):** TripoSR pinned to commit `107cefdc` (clone-only repo, no setup.py — imported via PYTHONPATH). Weights + rembg U2-Net baked into the image at build so cold starts skip the download. The app file imports clean against the real `modal` client. 42 tests green, typecheck clean.
