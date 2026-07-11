# 04 — Task: provision a GPU environment for the reconstruction prototype

**Type:** wayfinder:task (HITL)

**Status:** closed

**Blocked by:** None — can start immediately (parallel to ticket 02)

## Question

Ticket 01 recommends self-hosting TripoSR (~6GB VRAM, sub-second on an A100) with InstantMesh as a
fallback (needs more VRAM, ~24GB card reported OOMing). Nothing in the current stack (Notes on the
map) accounts for GPU access yet — this must exist before ticket 03's prototype can actually run.

This is a task, not a decision: sign up for and provision GPU compute (a cloud GPU rental —
e.g. an on-demand A100/L4-class instance — is likely sufficient for a one-off prototype run,
cheaper than committing to dedicated infrastructure this early).

**Note:** account creation and payment setup are things only the human can do — this ticket hands
back a checklist rather than being resolved by the agent alone:

- [ ] Choose a GPU rental provider (evaluate options — many bill per-second/minute, no long-term
      commitment needed for a single prototype run)
- [ ] Create an account and add a payment method
- [ ] Provision an instance meeting TripoSR's ~6GB VRAM minimum (aim higher to leave headroom for
      testing InstantMesh's larger footprint too)
- [ ] Confirm SSH/notebook access works and record how later sessions should reach it

## Resolution

No cloud rental needed — the developer already has a local 6GB VRAM GPU, which meets TripoSR's
~6GB requirement. Ticket 03 can run against it directly.

**Scope correction:** this ticket only ever covered compute for the one-off *prototype* run. The
production question — how the Reconstruction worker gets GPU compute for real, multi-user traffic
once a personal machine is no longer sufficient — was conflated into this ticket originally and
has been split out as its own question. See ticket 05.
