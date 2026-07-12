import type { ReconstructionEngine } from "./engine";
import { modalEngineFromEnv } from "./modal-engine";
import { StubReconstructionEngine } from "./stub-engine";

// Picks the worker's ReconstructionEngine from RECONSTRUCTION_ENGINE.
// TripoSR-on-Modal is the default (ticket 03); the stub survives as an
// explicit opt-out for local dev without a Modal deployment. Selecting modal
// without its env vars fails at startup, not on the first job.

export function selectEngineFromEnv(
  env: Record<string, string | undefined> = process.env,
): ReconstructionEngine {
  const choice = env.RECONSTRUCTION_ENGINE ?? "modal";
  switch (choice) {
    case "modal":
      return modalEngineFromEnv(env);
    case "stub":
      return new StubReconstructionEngine();
    default:
      throw new Error(
        `unknown RECONSTRUCTION_ENGINE "${choice}" — expected "modal" or "stub"`,
      );
  }
}
