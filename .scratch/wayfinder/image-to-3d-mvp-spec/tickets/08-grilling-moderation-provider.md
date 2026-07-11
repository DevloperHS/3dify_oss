# 08 — Grilling: moderation provider

**Type:** wayfinder:grilling (HITL)

**Status:** closed

**Blocked by:** None — can start immediately

## Question

Graduated from "Not yet specified." Moderation is a confirmed required pipeline stage (see
`CONTEXT.md`), but the provider/approach isn't picked. Options typically include a dedicated
moderation API (e.g. one of the major cloud providers' image-moderation services) versus a
lighter-weight/cheaper check. Given the stack is otherwise greenfield with no cloud provider
commitment yet, does the user have a preference, or should this become a quick research ticket
instead of a direct decision?

## Decision

- **Provider:** Cloudinary's built-in Amazon Rekognition AI Moderation add-on
  (`moderation: aws_rek`), applied directly to the Source Image already stored in Cloudinary.
  No separate AWS account, SDK integration, or new cloud provider commitment needed — the
  add-on is fully integrated into Cloudinary's existing upload pipeline and has a free tier
  available even on Cloudinary's free plan (see
  [Amazon Rekognition AI Moderation Add-on](https://cloudinary.com/documentation/aws_rekognition_ai_moderation_addon)).
  Swappable later behind the Moderation stage's seam (per `codebase-design`) if Rekognition's
  categories/accuracy prove insufficient.
- **Result delivery:** webhook-based, not polling. Cloudinary's moderation add-on posts the
  result asynchronously to a `notification_url`, which points at a Next.js API route. That
  route updates the Job's status and advances it out of the Moderation stage into
  Preprocessing (or marks it terminally failed — see ticket 07's failure-handling decision) —
  consistent with the pipeline's existing async/job-queue model.
