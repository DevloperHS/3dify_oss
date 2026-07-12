import { describe, expect, it } from "vitest";
import { ModalReconstructionEngine } from "./modal-engine";
import { selectEngineFromEnv } from "./select-engine";
import { StubReconstructionEngine } from "./stub-engine";

const modalEnv = {
  MODAL_TRIPOSR_URL: "https://example--maker-triposr.modal.run/",
  MODAL_KEY: "wk-test",
  MODAL_SECRET: "ws-test",
};

describe("selectEngineFromEnv", () => {
  it("defaults to the Modal engine", () => {
    expect(selectEngineFromEnv(modalEnv)).toBeInstanceOf(
      ModalReconstructionEngine,
    );
  });

  it("fails fast when the Modal engine is selected but unconfigured", () => {
    expect(() => selectEngineFromEnv({})).toThrow(/MODAL_TRIPOSR_URL/);
  });

  it("returns the stub only when explicitly opted into", () => {
    expect(
      selectEngineFromEnv({ RECONSTRUCTION_ENGINE: "stub" }),
    ).toBeInstanceOf(StubReconstructionEngine);
  });

  it("rejects unknown engine names", () => {
    expect(() =>
      selectEngineFromEnv({ RECONSTRUCTION_ENGINE: "instantmesh" }),
    ).toThrow(/instantmesh/);
  });
});
