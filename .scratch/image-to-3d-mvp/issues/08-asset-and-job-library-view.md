# 08 — Asset & Job library view

**What to build:** A signed-in user can see their full Job history — including failed ones with their reasons — not just their most recent upload, plus their permanent Asset library.

**Blocked by:** 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end, 07 — Failed-job handling: retries, terminal/transient classification, failure_reason

**Status:** ready-for-agent

- [ ] A signed-in user can view a list of all their past Jobs, most recent first
- [ ] Each Job in the list shows its outcome: succeeded (linking to its Asset), or failed (showing its `failure_reason`)
- [ ] A signed-in user can view a list of all their permanent Assets, separate from or alongside the Job history
- [ ] Each Asset in the library is viewable in-browser and downloadable, consistent with ticket 02's viewer
- [ ] A user cannot see another user's Jobs or Assets
