# Needs You — blocked-on-human checklist

Running list of everything the autonomous build run (2026-07-12) could not do
without your accounts, cards, or browser auth. Work through top to bottom when
you're back. Everything else was built and tested against fakes/stubs.

## 1. Modal deploy (ticket 03 — live TripoSR verification)

- [ ] Sign up at modal.com (GitHub login, starter plan, no card)
- [ ] `modal token new` (opens browser)
- [ ] `modal deploy modal/triposr_app.py` (~10-15 min first build)
- [ ] Dashboard → Settings → Proxy Auth Tokens → create; put
      `MODAL_TRIPOSR_URL`, `MODAL_KEY`, `MODAL_SECRET` in `.env`
- [ ] Smoke: `modal run modal/triposr_app.py --image-path <photo.png>`
- [ ] Live e2e: `pnpm dev` + `pnpm worker`, upload a photo, confirm a real
      (non-cube) mesh renders — then tick the last box in
      `.scratch/image-to-3d-mvp/issues/03-real-reconstruction-triposr-modal.md`

*(items added below as the run discovers them)*
