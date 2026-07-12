// The Reconstruction seam — the one pipeline stage with a formal pluggable
// interface (spec.md "Pipeline stages and module boundaries"). Implementations:
// StubReconstructionEngine (this ticket), TripoSR on Modal (ticket 03),
// InstantMesh (fallback, only if TripoSR's fidelity disappoints).
//
// The engine receives preprocessed image bytes and returns a raw mesh as GLB
// bytes. Known, accepted characteristics of real output: vertex-colored (not
// UV-textured) and not watertight — Postprocessing repairs it (ticket 04).

export type ReconstructionInput = {
  imageBytes: Uint8Array;
  contentType: string;
};

export type ReconstructionResult = {
  glb: Uint8Array;
};

export interface ReconstructionEngine {
  reconstruct(input: ReconstructionInput): Promise<ReconstructionResult>;
}
