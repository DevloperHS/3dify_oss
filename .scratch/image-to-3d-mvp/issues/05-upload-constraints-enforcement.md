# 05 — Upload constraints enforcement

**What to build:** Uploads are validated against the agreed constraints (format allowlist, max size, min/max resolution) with clear rejection errors, instead of silently proceeding into the pipeline with unusable input.

**Blocked by:** 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end

**Status:** closed (2026-07-12)

- [x] An upload with a non-JPEG/PNG/WebP file type (e.g. HEIC, GIF) is rejected with a clear, specific error before a Job is created — format sniffed from magic bytes (`src/upload/constraints.ts`), HEIC called out by name; rejection happens before Cloudinary storage too
- [x] An upload over 10MB is rejected with a clear error before a Job is created (size checked before content)
- [x] An upload under 256×256px is rejected with a clear error before a Job is created (measured dimensions in the message)
- [x] An upload over ~2048×2048px is accepted and downscaled server-side during Preprocessing (`src/preprocessing/downscale.ts`, fit-inside 2048, aspect preserved; within-bounds images pass through byte-identical) — worker now transitions queued → preprocessing → reconstructing
- [x] Valid uploads proceed exactly as in ticket 02 (route tests unchanged in behavior; stored MIME now derived from sniffed format, not client-supplied)

**Implementation notes (2026-07-12):** dimension parsing + downscale via
`sharp`. Background removal (Preprocessing's other responsibility) stays
inside the Modal TripoSR function from ticket 03 — noted in the module
comment, not duplicated here.
