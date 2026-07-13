# Needs You — blocked-on-human checklist

Running list of everything the autonomous build run (2026-07-12) could not do
without your accounts, cards, or browser auth. Work through top to bottom when
you're back. Everything else was built and tested against fakes/stubs.

## 1. Modal deploy (ticket 03 — live TripoSR verification)

- [x] Sign up at modal.com (GitHub login, starter plan, no card)
- [ ] `modal token new` (opens browser)
- [x] `modal deploy modal/triposr_app.py` (~10-15 min first build)
- [x] Dashboard → Settings → Proxy Auth Tokens → create; put
      `MODAL_TRIPOSR_URL`, `MODAL_KEY`, `MODAL_SECRET` in `.env`
- [x] Smoke: `modal run modal/triposr_app.py --image-path <photo.png>`
      (ran 2026-07-13 with the prototype chair — valid 1.65MB GLB back)
- [ ] Live e2e: `pnpm dev` + `pnpm worker`, upload a photo, confirm a real
      (non-cube) mesh renders — then tick the last box in
      `.scratch/image-to-3d-mvp/issues/03-real-reconstruction-triposr-modal.md`

## 2. Cloudinary moderation add-on (ticket 06 — live verification)

The gate is fully built and tested behind a flag; flipping it on needs:

- [ ] Cloudinary dashboard → Add-ons → "Amazon Rekognition AI Moderation" →
      subscribe to the free tier (50 moderations/month, no card)
- [ ] Set `MODERATION_ENABLED=true` in `.env`
- [ ] Set `MODERATION_WEBHOOK_URL` to a publicly reachable URL for
      `/api/webhooks/cloudinary-moderation` — in production that's the deploy
      domain; for a local test use a tunnel (e.g. `cloudflared tunnel` or
      `ngrok`) pointing at :3000
- [ ] Upload a photo and watch it pass through `moderating`; the webhook
      handler logs its outcome in the response

## 3. Local `.env` flip after Modal deploy

Your `.env` currently has `RECONSTRUCTION_ENGINE=stub` so `pnpm worker` runs
without a Modal deployment (I switched it — it was `modal` with `replace-me`
placeholders, which fails at startup by design). After completing item 1:

- [ ] Fill the real `MODAL_TRIPOSR_URL` / `MODAL_KEY` / `MODAL_SECRET`
- [ ] Set `RECONSTRUCTION_ENGINE=modal`

## 4. Live end-to-end pass (browser)

Automated tests cover every seam, but a human browser run is the final check
(Google sign-in can't be automated here):

- [ ] `docker compose up -d && pnpm dev` + `pnpm worker`
- [ ] Sign in, upload a photo, watch the job page: queued → preprocessing →
      reconstructing → postprocessing → exporting → succeeded, viewer +
      download work
- [ ] Try the rejects: an >10MB file, a tiny (<256px) image, a GIF/HEIC —
      each should be refused with a specific message before a job appears
- [ ] Check `/library`: assets listed with working View/Download, job
      history shows any failures with their reasons

## 5. One product decision (from the closing review)

- [ ] If Cloudinary's moderation webhook never arrives, a job sits in
      `moderating` forever (no timeout/reaper) and its source image is never
      swept. Decide the policy (e.g. fail after 24h) — recorded as known debt
      #5 in `build_docs/handoff.md`.

*(items added below as the run discovers them)*
