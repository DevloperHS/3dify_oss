# 05 — Upload constraints enforcement

**What to build:** Uploads are validated against the agreed constraints (format allowlist, max size, min/max resolution) with clear rejection errors, instead of silently proceeding into the pipeline with unusable input.

**Blocked by:** 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end

**Status:** ready-for-agent

- [ ] An upload with a non-JPEG/PNG/WebP file type (e.g. HEIC, GIF) is rejected with a clear, specific error before a Job is created
- [ ] An upload over 10MB is rejected with a clear error before a Job is created
- [ ] An upload under 256×256px is rejected with a clear error before a Job is created
- [ ] An upload over ~2048×2048px is accepted and downscaled server-side during Preprocessing, not rejected
- [ ] Valid uploads (correct format, size, resolution) are unaffected and proceed exactly as in ticket 02
