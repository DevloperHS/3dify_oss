# 03 — Real Reconstruction: TripoSR on Modal

**What to build:** Uploaded photos produce an actual TripoSR-generated mesh instead of ticket 02's placeholder — served through the same `ReconstructionEngine` interface, running as a Modal serverless GPU function (scale-to-zero).

**Blocked by:** 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end

**Status:** ready-for-agent

- [ ] TripoSR is packaged and deployed as a Modal serverless GPU function (scale-to-zero by default)
- [ ] A `ReconstructionEngine` implementation calls the Modal function over HTTP and returns TripoSR's real mesh output
- [ ] The BullMQ worker uses this implementation in place of ticket 02's stub, with no changes required to any other pipeline stage
- [ ] The Reconstruction stage's BullMQ job timeout is configured generously (3-5 minutes) to absorb a Modal cold start
- [ ] Uploading a real photo end-to-end produces and stores a real (non-placeholder) TripoSR mesh as the resulting Asset
