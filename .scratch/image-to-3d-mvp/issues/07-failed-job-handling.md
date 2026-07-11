# 07 — Failed-job handling: retries, terminal/transient classification, failure_reason

**What to build:** Transient failures (e.g. a Modal cold-start/timeout) automatically retry with backoff before giving up; terminal failures (e.g. moderation rejection) fail immediately with no retry; every failed Job carries a categorized, user-facing reason; only successfully completed Jobs count toward the future usage-metering query.

**Blocked by:** 03 — Real Reconstruction: TripoSR on Modal, 06 — Moderation gate

**Status:** ready-for-agent

- [ ] Every failure raised anywhere in the pipeline is tagged `terminal` or `transient` at the point it's raised
- [ ] A transient failure (e.g. a simulated Modal timeout) is automatically retried up to 3 total attempts with exponential backoff starting at 10s
- [ ] A terminal failure (e.g. moderation rejection) is not retried and fails the Job immediately
- [ ] Every failed Job has a non-null, categorized, user-facing `failure_reason` with no internal detail (stack traces, provider names) leaked
- [ ] A query/view for "successful Job count for user X" exists and excludes both terminal and transient-exhausted failed Jobs
- [ ] A transient failure that exhausts all 3 attempts ends in the Job's `failed` state, not stuck retrying indefinitely
