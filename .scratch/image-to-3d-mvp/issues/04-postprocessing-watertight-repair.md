# 04 — Postprocessing: mesh repair for watertight export

**What to build:** The Asset a user downloads/views is watertight (holes repaired), not TripoSR's raw non-watertight output — confirmed necessary by the reconstruction prototype.

**Blocked by:** 03 — Real Reconstruction: TripoSR on Modal

**Status:** ready-for-agent

- [ ] A Postprocessing step runs after Reconstruction and before Export/Storage
- [ ] The step repairs/fills holes in TripoSR's raw mesh output
- [ ] The exported GLB is verified watertight (e.g. via a mesh-validation check) before being uploaded to R2
- [ ] A previously-known non-watertight test mesh (e.g. the prototype's `output-chair.glb`) becomes watertight after passing through this step
- [ ] Vertex colors are preserved through the repair step (no UV-unwrapping performed — out of scope per spec)
