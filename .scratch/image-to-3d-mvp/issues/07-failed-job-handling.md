# 07 — Failed-job handling: retries, terminal/transient classification, failure_reason

**What to build:** Transient failures (e.g. a Modal cold-start/timeout) automatically retry with backoff before giving up; terminal failures (e.g. moderation rejection) fail immediately with no retry; every failed Job carries a categorized, user-facing reason; only successfully completed Jobs count toward the future usage-metering query.

**Blocked by:** 03 — Real Reconstruction: TripoSR on Modal, 06 — Moderation gate

**Status:** closed (2026-07-12)

- [x] Every failure raised anywhere in the pipeline is tagged at the point it's raised — `PipelineFailure` (`src/jobs/failures.ts`) thrown by the Modal engine (timeout/network/5xx/429 transient, other 4xx terminal), preprocessing (undecodable image terminal), postprocessing (unrepairable mesh transient), source fetch (transient); untagged errors default to transient
- [x] A transient failure is automatically retried up to 3 total attempts with exponential backoff starting at 10s — BullMQ `attempts: 3`, `backoff: exponential/10s` on enqueue; stage transitions are forward-only writes, so a retry re-enters cleanly wherever the last attempt died (also fixes what would have been an invalid backwards transition on any retry)
- [x] A terminal failure is not retried and fails the Job immediately — worker maps terminal `PipelineFailure` to BullMQ `UnrecoverableError`; moderation rejection (ticket 06) never enters the queue at all
- [x] Every failed Job has a non-null, categorized, user-facing `failure_reason` — `userFacingReason` is separate from the log-facing message; tests assert no provider names/status codes leak
- [x] "Successful Job count for user X" exists (`succeededJobCount`, `src/jobs/metering.ts`) and excludes failed Jobs of both kinds
- [x] A transient failure that exhausts all 3 attempts ends `failed` with `failure_category: transient` (asserted at attempt 3/3)

**Implementation notes (2026-07-12):** `job.attempts` column now records the
attempt number each run. Asset insert is idempotent (`onConflictDoNothing` on
job_id) so a retry that died between upload and success doesn't violate the
unique constraint.
