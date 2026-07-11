# 07 — Grilling: failed-job handling

**Type:** wayfinder:grilling (HITL)

**Status:** closed

**Blocked by:** None — can start immediately

## Question

Graduated from "Not yet specified." When a Job fails (Moderation rejects the image, Reconstruction
errors out, a Modal cold-start/timeout, etc.), what happens? Automatic retry (how many times)?
Does the user get notified with a reason, or just "failed"? Since billing/metering is deferred but
the account/job model must support future metering — should a failed job still count against a
future usage count, or only successful ones?

## Decision

- **Failure categorization:** every failure is tagged `terminal` or `transient` at the point it's
  raised. Moderation rejection is always terminal (retrying won't change the outcome). Modal
  cold-start/timeout is transient (infra hiccup, unrelated to the input). Ambiguous Reconstruction
  errors (e.g. TripoSR can't find a foreground subject) are judged case-by-case at implementation
  time.
- **Retry policy:** transient failures get 3 total attempts (1 original + 2 retries) via BullMQ's
  built-in retry mechanism, exponential backoff starting at 10s (10s, then 20s) — enough to ride
  out a Modal cold start without making the user wait minutes. Terminal failures get zero retries
  and fail immediately.
- **User notification:** the user sees a short, categorized failure reason (e.g.
  `rejected: content moderation` vs `failed: processing error, please retry`) rather than a bare
  "failed" — no internal detail (stack traces, provider names) leaked. Requires a `failure_reason`
  column on the Job row.
- **Metering:** only successful Jobs count toward the future usage metric. Failed Jobs — whether
  terminal or transient-exhausted — never count, even if GPU compute was spent chasing a transient
  failure before giving up.
