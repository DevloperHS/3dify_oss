// Job state machine — the cross-cutting deep module from spec.md "Job
// orchestration". Pure: no I/O, no db. Persistence layers call
// assertTransition before writing a status change.
//
// Rules:
// - Pipeline stages advance forward-only through PIPELINE_ORDER. Skipping
//   ahead is allowed so stages that aren't built yet (Moderation,
//   Preprocessing, Postprocessing) can be bypassed without loosening the
//   no-backwards invariant.
// - `failed` is reachable from any non-terminal state.
// - Terminal states (`succeeded`, `failed`) have no exits.

export const PIPELINE_ORDER = [
  "queued",
  "moderating",
  "preprocessing",
  "reconstructing",
  "postprocessing",
  "exporting",
  "succeeded",
] as const;

export const JOB_STATUSES = [...PIPELINE_ORDER, "failed"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export function isTerminal(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed";
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (isTerminal(from)) return false;
  if (to === "failed") return true;
  const fromIndex = PIPELINE_ORDER.indexOf(
    from as (typeof PIPELINE_ORDER)[number],
  );
  const toIndex = PIPELINE_ORDER.indexOf(to as (typeof PIPELINE_ORDER)[number]);
  return toIndex > fromIndex;
}

export class InvalidJobTransitionError extends Error {
  constructor(from: JobStatus, to: JobStatus) {
    super(`invalid job transition: ${from} → ${to}`);
    this.name = "InvalidJobTransitionError";
  }
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidJobTransitionError(from, to);
  }
}
