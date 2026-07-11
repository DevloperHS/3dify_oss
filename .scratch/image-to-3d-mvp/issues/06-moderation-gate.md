# 06 — Moderation gate

**What to build:** Images are screened via Cloudinary's Amazon Rekognition AI Moderation add-on before any Reconstruction compute is spent; rejected images terminally fail the Job with a categorized reason, clean images proceed as before.

**Blocked by:** 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end

**Status:** ready-for-agent

- [ ] Every uploaded Source Image is submitted to Cloudinary's Amazon Rekognition AI Moderation add-on (`moderation: aws_rek`) automatically on upload
- [ ] Cloudinary's moderation result is received via a `notification_url` webhook to a Next.js API route, not polled
- [ ] A passing image advances the Job to Preprocessing exactly as before
- [ ] A rejected image marks the Job failed with `failure_category: terminal` and a `failure_reason` describing content moderation, without ever reaching Reconstruction
- [ ] The user sees the categorized rejection reason on the Job status page
