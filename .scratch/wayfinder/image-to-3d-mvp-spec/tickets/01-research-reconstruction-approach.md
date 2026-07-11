# 01 — Research: image-to-3D reconstruction approach

**Type:** wayfinder:research (AFK)

**Status:** closed

## Resolution

**Recommendation: self-hosted TripoSR (primary), InstantMesh (quality-upgrade fallback).**

TripoSR is MIT-licensed, needs only ~6GB VRAM, and runs sub-second on an A100
([GitHub](https://github.com/VAST-AI-Research/TripoSR), [arXiv:2403.02151](https://arxiv.org/abs/2403.02151))
— the cheapest inference footprint of every candidate researched, and it slots directly into the
GPU-capable worker process the map already specifies rather than fighting the async-pipeline
architecture. Self-hosting also sidesteps the data-handling question entirely (no third party ever
touches user images).

Every commercial API researched (Meshy, Tripo3D, Stability's Stable Fast 3D, Hyper3D Rodin)
charges $0.20–$1.50+ per generation and requires actively monitoring vendor-specific
training/retention clauses — workable, but a worse fit for a cost-sensitive build once a GPU
worker is already required infrastructure.

InstantMesh is the fallback if TripoSR's fidelity (it trails on published Chamfer/F-score
benchmarks) proves insufficient in testing — same zero-per-call cost and self-hosted privacy
story, ~10s latency (still fine for an async queue), but needs meaningfully more VRAM (a 24GB card
OOM'd in a filed GitHub issue), roughly doubling GPU rental cost.

Full detail, citations, and flagged unverified items (Tripo3D's JS-rendered docs, Stability's
ambiguous per-call credit cost, Hyper3D's undocumented latency, CSM.ai's unconfirmed operating
status) are in the linked asset below.

**Asset:** [research/01-reconstruction-approach.md](../research/01-reconstruction-approach.md)

**Blocked by:** None — can start immediately

## Question

Compare candidate approaches for the Reconstruction pipeline stage (single image → 3D mesh):

- Third-party APIs (e.g. Meshy, Tripo3D, Stability's 3D offerings, others found during research)
- Self-hosted open-source models (e.g. TripoSR, InstantMesh, others found during research)

For each, capture: cost model, output quality (as documented/demoed), latency, and data-handling
terms (does a third-party API retain or train on uploaded user images — relevant since no hard
privacy constraint was set, but this still needs to be known, not assumed).

Produce a shortlist of the top 1–2 candidates with a recommendation, as a cited markdown file.
