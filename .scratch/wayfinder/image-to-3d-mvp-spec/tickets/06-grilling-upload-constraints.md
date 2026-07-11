# 06 — Grilling: upload constraints

**Type:** wayfinder:grilling (HITL)

**Status:** closed

**Blocked by:** None — can start immediately

## Question

Graduated from "Not yet specified." What are the constraints on an uploaded Source Image: max
file size, accepted formats (JPEG/PNG at minimum — does HEIC need support, given iOS users
photograph objects directly?), and any minimum/maximum resolution?

## Decision

- **Accepted formats:** JPEG, PNG, WebP only. HEIC is rejected at upload — no server-side
  conversion; iOS users must export/share as JPEG before uploading. Rationale: keeps the
  Source Image contract simple for every downstream stage (Moderation, Preprocessing,
  Reconstruction), and Cloudinary auto-conversion was considered but rejected in favor of
  a strict client-side requirement.
- **Max file size:** 10 MB. This matches Cloudinary's free-plan hard cap (images/raw files
  are capped at 10 MB regardless of app-level settings — see
  [Cloudinary support](https://support.cloudinary.com/hc/en-us/articles/202520592-Do-you-have-a-file-size-limit)),
  so there's no reason to set the app limit any stricter; a single-object phone photo
  (typically 2-8 MB) comfortably fits.
- **Resolution:** hard-reject uploads below 256×256px (too little detail for background
  removal/reconstruction to find a clean silhouette). No max-resolution rejection — images
  above ~2048×2048px are downscaled server-side during Preprocessing rather than blocked,
  since TripoSR's internal preprocessing works at a fixed resolution and gains nothing from
  higher input resolution.
