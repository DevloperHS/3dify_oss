import { PipelineFailure } from "@/jobs/failures";
import type {
  ReconstructionEngine,
  ReconstructionInput,
  ReconstructionResult,
} from "./engine";
import { hasGlbMagic } from "./glb";

// The real Reconstruction implementation (ticket 03): calls TripoSR deployed
// as a Modal serverless GPU function (modal/triposr_app.py) over HTTP. The
// endpoint is protected by Modal proxy auth — every request carries the
// Modal-Key/Modal-Secret pair of a proxy auth token.
//
// The request timeout is the pipeline's reconstruction timeout: generous by
// default (4 min) so a Modal cold start — image pull + model load, worst case
// a couple of minutes — never kills an otherwise healthy job. BullMQ itself
// imposes no per-job execution timeout, so this is where the ticket's
// "generous job timeout" lives.

export const DEFAULT_RECONSTRUCTION_TIMEOUT_MS = 4 * 60 * 1000;

export type ModalEngineOptions = {
  endpointUrl: string;
  modalKey: string;
  modalSecret: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
};

export class ModalReconstructionEngine implements ReconstructionEngine {
  constructor(private readonly options: ModalEngineOptions) {}

  async reconstruct(input: ReconstructionInput): Promise<ReconstructionResult> {
    const {
      endpointUrl,
      modalKey,
      modalSecret,
      timeoutMs = DEFAULT_RECONSTRUCTION_TIMEOUT_MS,
      fetchFn = fetch,
    } = this.options;

    let response: Response;
    try {
      response = await fetchFn(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": input.contentType,
          "Modal-Key": modalKey,
          "Modal-Secret": modalSecret,
        },
        // Copy into a plain ArrayBuffer — a Uint8Array view's buffer may be
        // larger than the view, and fetch sends the whole buffer.
        body: input.imageBytes.slice().buffer,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      // Timeout (cold start overran) or network failure — transient by the
      // spec's own example.
      throw new PipelineFailure(
        "transient",
        "the 3D reconstruction timed out and will be retried",
        `TripoSR endpoint unreachable or timed out after ${timeoutMs}ms`,
        { cause },
      );
    }
    if (!response.ok) {
      // Server-side/overload problems are worth retrying; anything else means
      // this input will never reconstruct.
      const transient = response.status >= 500 || response.status === 429;
      throw new PipelineFailure(
        transient ? "transient" : "terminal",
        transient
          ? "the 3D reconstruction service was temporarily unavailable"
          : "the image could not be turned into a 3D model",
        `TripoSR endpoint failed: HTTP ${response.status}`,
      );
    }

    const glb = new Uint8Array(await response.arrayBuffer());
    if (!hasGlbMagic(glb)) {
      throw new PipelineFailure(
        "transient",
        "the 3D reconstruction returned an invalid model",
        "TripoSR endpoint returned a non-GLB response",
      );
    }
    return { glb };
  }
}

export function modalEngineFromEnv(
  env: Record<string, string | undefined> = process.env,
): ModalReconstructionEngine {
  const missing = ["MODAL_TRIPOSR_URL", "MODAL_KEY", "MODAL_SECRET"].filter(
    (name) => !env[name],
  );
  if (missing.length > 0) {
    throw new Error(
      `Modal reconstruction engine requires ${missing.join(", ")} — see .env.example`,
    );
  }
  // Catches .env.example placeholders ("replace-me") at startup instead of
  // failing confusingly on the first job.
  if (!URL.canParse(env.MODAL_TRIPOSR_URL!)) {
    throw new Error(
      `MODAL_TRIPOSR_URL is not a valid URL: "${env.MODAL_TRIPOSR_URL}"`,
    );
  }
  return new ModalReconstructionEngine({
    endpointUrl: env.MODAL_TRIPOSR_URL!,
    modalKey: env.MODAL_KEY!,
    modalSecret: env.MODAL_SECRET!,
    timeoutMs: env.RECONSTRUCTION_TIMEOUT_MS
      ? Number(env.RECONSTRUCTION_TIMEOUT_MS)
      : undefined,
  });
}
