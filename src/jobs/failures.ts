// Failure categorization (ticket 07, spec.md "Job orchestration"): every
// failure is tagged `terminal` or `transient` at the point it's raised, by
// throwing PipelineFailure there. `message` may carry internal detail for
// logs; `userFacingReason` is what lands in the Job's failure_reason and must
// never leak stack traces, status codes, or provider names.
//
// Untagged errors default to transient (retries are cheap; a deterministic
// bug exhausts its attempts and fails anyway) with the generic reason below.

export type FailureCategory = "terminal" | "transient";

export const GENERIC_FAILURE_REASON = "processing error";

export class PipelineFailure extends Error {
  constructor(
    readonly category: FailureCategory,
    readonly userFacingReason: string,
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? userFacingReason, options);
    this.name = "PipelineFailure";
  }
}

export function categorize(error: unknown): {
  category: FailureCategory;
  userFacingReason: string;
} {
  if (error instanceof PipelineFailure) {
    return { category: error.category, userFacingReason: error.userFacingReason };
  }
  return { category: "transient", userFacingReason: GENERIC_FAILURE_REASON };
}
