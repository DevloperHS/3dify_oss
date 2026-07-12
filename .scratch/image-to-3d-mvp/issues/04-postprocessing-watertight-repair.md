# 04 — Postprocessing: mesh repair for watertight export

**What to build:** The Asset a user downloads/views is watertight (holes repaired), not TripoSR's raw non-watertight output — confirmed necessary by the reconstruction prototype.

**Blocked by:** 03 — Real Reconstruction: TripoSR on Modal

**Status:** closed (2026-07-12)

- [x] A Postprocessing step runs after Reconstruction and before Export/Storage (`processJob`: reconstructing → postprocessing → exporting; `src/postprocessing/watertight.ts`)
- [x] The step repairs/fills holes in TripoSR's raw mesh output (boundary-loop detection + centroid-fan capping, all vertex attributes averaged)
- [x] The exported GLB is verified watertight before upload — `repairToWatertight` re-checks after capping and throws (failing the job) if boundary edges remain
- [x] A previously-known non-watertight test mesh becomes watertight — integration test runs the prototype's real `output-chair.glb` through the repair
- [x] Vertex colors are preserved through the repair step (asserted per-vertex in tests; no UV-unwrapping)

**Implementation notes (2026-07-12):** Pure-TS on `@gltf-transform/core` (MIT).
"Watertight" = zero boundary edges (every edge shared by ≥2 triangles) — the
property hole-capping restores; pre-existing non-manifold edges are left
alone. Postprocessing is pure CPU, so the real implementation runs in worker
tests too (no fake).
