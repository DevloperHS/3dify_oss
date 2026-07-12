# 08 — Asset & Job library view

**What to build:** A signed-in user can see their full Job history — including failed ones with their reasons — not just their most recent upload, plus their permanent Asset library.

**Blocked by:** 02 — Tracer bullet: upload photo → placeholder GLB asset, end-to-end, 07 — Failed-job handling: retries, terminal/transient classification, failure_reason

**Status:** closed (2026-07-12)

- [x] A signed-in user can view a list of all their past Jobs, most recent first (`/library`, server-rendered from `src/library/queries.ts`; ordering asserted in tests)
- [x] Each Job shows its outcome: succeeded links to its Asset (via the Job page viewer), failed shows its `failure_reason`, in-flight links to the polling progress page
- [x] Assets listed in their own section above the Job history, with created-at and size
- [x] Each Asset is viewable in-browser ("View in 3D" → the Job page's ticket-02 `<model-viewer>`) and downloadable (presigned URL)
- [x] A user cannot see another user's Jobs or Assets — enforced in the queries (user-scoped WHERE), asserted in tests; the page redirects unauthenticated visitors

**Implementation notes (2026-07-12):** no new API routes — the page is a
server component querying directly. Presigned download URLs expire after 1h
(known debt #3 in the handoff, unchanged).
