# 06 — Moderation gate

**What to build:** Images are screened via Cloudinary's Amazon Rekognition AI Moderation add-on before any Reconstruction compute is spent; rejected images terminally fail the Job with a categorized reason, clean images proceed as before.

**Blocked by:** 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end

**Status:** implemented behind `MODERATION_ENABLED` — live verification pending Cloudinary add-on activation (human action)

- [x] Every uploaded Source Image is submitted to `moderation: aws_rek` automatically on upload — when `MODERATION_ENABLED=true` (`src/storage/source-images.ts` upload options; flag needed because the add-on must be activated on the Cloudinary account first, else uploads error)
- [x] Cloudinary's moderation result is received via a `notification_url` webhook (`src/app/api/webhooks/cloudinary-moderation/route.ts`), authenticated by Cloudinary's SHA-1 notification signature with a 2h replay window — not polled
- [x] A passing image advances the Job exactly as before — approval enqueues the Job; the worker picks it up from `moderating`
- [x] A rejected image marks the Job failed with `failure_category: terminal` and a user-facing `failure_reason`, without ever reaching Reconstruction — with moderation on, a Job only reaches the queue through webhook approval, closing the "moderation bypass" debt for the moderated path
- [x] The user sees the categorized rejection reason on the Job status page (existing failed-state UI renders `failureReason`)

**Implementation notes (2026-07-12):** gate logic in `src/moderation/gate.ts`
(idempotent on duplicate deliveries; unknown public_ids acknowledged). Human
steps to go live are in `build_docs/needs-human.md`: enable the Rekognition
add-on in the Cloudinary dashboard, set `MODERATION_ENABLED=true` and a
publicly reachable `MODERATION_WEBHOOK_URL`.
