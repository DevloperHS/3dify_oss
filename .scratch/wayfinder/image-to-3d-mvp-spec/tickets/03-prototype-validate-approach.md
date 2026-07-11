# 03 — Prototype: validate chosen reconstruction approach

**Type:** wayfinder:prototype (HITL)

**Status:** closed

## Resolution

**Verdict: TripoSR works end-to-end and quality is good enough to build on — with two caveats.**

Ran the official `stabilityai/TripoSR` Hugging Face Space via its documented `gradio_client` API
(no local install needed — browser automation couldn't drive the file picker, so this doubled as
confirming the API path is the right way to script this, not just click through it), against
TripoSR's own `examples/chair.png`.

**Pipeline mechanics confirmed:**
- `/preprocess` (background removal + framing): 7.19s
- `/generate` (reconstruction): 12.68s
- Total: 19.88s — but this is the **public, rate-limited, queued ZeroGPU demo**, not dedicated
  hardware. Not representative of production latency; real numbers depend on whatever ticket 05
  picks for the compute backend.

**Output quality (inspected programmatically with `trimesh`, since this sandbox has no WebGL to
render a viewer):**
- 41,367 vertices / 82,566 faces — reasonably dense single mesh.
- Bounding box proportions plausible for the input object (taller than wide, matching a chair).
- GLB file size: 1.65MB — fine for R2/CDN delivery, matches the format decision already locked.
- **Caveat 1 — not watertight.** The mesh has holes/gaps (expected for single-image reconstruction
  — occluded surfaces are guessed or left open). The Postprocessing pipeline stage will need a
  mesh-repair/hole-filling step before export, not just optimization. Added to `CONTEXT.md`.
- **Caveat 2 — vertex-colored, not UV-textured.** TripoSR bakes color per-vertex
  (`ColorVisuals`/vertex colors), it does not produce a UV-mapped texture image. This is fine for
  `<model-viewer>` and most glTF consumers, but any future export target or tool that assumes a
  texture map (rather than vertex colors) will need explicit handling.

**Assets:** [test-chair.png](../prototype/test-chair.png) (input),
[output-chair.glb](../prototype/output-chair.glb) (output, 1.65MB),
[run_triposr_test.py](../prototype/run_triposr_test.py) (repro script, throwaway).

**Blocked by:** None — the developer's local 6GB VRAM GPU meets TripoSR's requirement (see ticket 04)

## Question

Ticket 01 (closed) recommends self-hosted TripoSR as primary, InstantMesh as fallback. Run a real
test image through TripoSR on the local GPU and confirm actual mesh quality and latency are good
enough for the product — before committing the Reconstruction stage's architecture around it. Fall
back to trying InstantMesh only if TripoSR's fidelity disappoints. Raise the fidelity of the
"which approach" discussion with a concrete artifact to react to, per the `prototype` skill.
