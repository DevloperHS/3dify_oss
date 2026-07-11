# 05 — Research: production GPU compute backend for the Reconstruction worker

**Type:** wayfinder:research (AFK)

**Status:** closed

## Resolution

**Recommendation: Modal.** Confirms the working assumption — serverless/pay-per-second over
dedicated autoscaled instances, for now.

Default scale-to-zero (pay $0 while idle), a documented GPU-memory-snapshot cold-start mitigation
(Modal's own examples show multi-minute cold starts cut to single-digit seconds), and a
low-friction Python-decorator packaging model (full custom Docker support, needed since TripoSR
isn't a one-click template anywhere) are the best match for an unproven, low-traffic pipeline
behind the BullMQ queue — a 10-30s cold start is invisible to a user polling an async job.

Runner-up: **RunPod Serverless** — competitive per-hour rate, but a wider and less-precisely
documented cold-start worst case (a 7-minute unhealthy-worker ceiling was found in their docs).
**Replicate** is the weakest serverless fit: its custom/private-deployment billing charges for
idle time by default, undercutting the entire "pay only for active compute" premise. **Traditional
autoscaled instances** (AWS G5/G4dn, GCP L4, Lambda Labs) all confirmed no built-in scale-to-zero
— would cost ~$384–942/month running 24/7, only justified once there's sustained real traffic.

**Confirmed:** TripoSR is not a one-click deploy anywhere — a community Replicate listing 404'd
when checked directly, RunPod's TripoSR content is a "build your own container" guide. Packaging
it as a Modal function is real implementation work, not a further open decision — belongs in
`/to-tickets` later, not this map.

**Caveats (don't block the Modal decision, but worth knowing):** AWS/GCP on-demand hourly rates
came from price-tracker sites, not a directly-fetchable primary source (their pricing pages are
JS-rendered); RunPod's exact per-second rate wasn't published, only the hourly-equivalent. These
only affect the losing options in this comparison.

**Asset:** [research/05-production-gpu-compute.md](../research/05-production-gpu-compute.md)

**Blocked by:** None — can start immediately (independent of ticket 03)

## Question

Split out from ticket 04: the developer's local 6GB GPU covers prototyping only, not production.
For real multi-user traffic, what should actually run TripoSR (and possibly InstantMesh) inference
in production?

Compare, against primary sources (official pricing/docs pages):

- **Serverless/on-demand GPU inference platforms** (Modal, RunPod Serverless, Replicate, Baseten,
  others found during research) — packaging model, per-second billing, cold-start latency, scale-
  to-zero behavior.
- **Traditional cloud GPU instances with autoscaling** (AWS G5/G4dn, GCP with L4, Lambda Labs) —
  pricing at sustained low/medium volume, autoscaling setup complexity, minimum viable instance
  size for TripoSR's ~6GB requirement.

Capture cost model, cold-start/latency implications for the async pipeline, and how much
integration work each requires against the existing Redis/BullMQ worker architecture.

Produce a recommendation: which to start with for an unproven, early-traffic product, given the
working assumption (from this conversation) that serverless/pay-per-second is the better fit until
volume justifies dedicated autoscaled instances — confirm or challenge that assumption with real
numbers.
