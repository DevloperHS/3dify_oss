import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  InvalidJobTransitionError,
  isTerminal,
  JOB_STATUSES,
} from "./state-machine";

describe("job state machine", () => {
  it("declares every status from the spec", () => {
    expect(JOB_STATUSES).toEqual([
      "queued",
      "moderating",
      "preprocessing",
      "reconstructing",
      "postprocessing",
      "exporting",
      "succeeded",
      "failed",
    ]);
  });

  it("allows advancing to the next pipeline stage", () => {
    expect(canTransition("queued", "moderating")).toBe(true);
    expect(canTransition("moderating", "preprocessing")).toBe(true);
    expect(canTransition("reconstructing", "postprocessing")).toBe(true);
    expect(canTransition("exporting", "succeeded")).toBe(true);
  });

  it("allows skipping stages that are not built yet (forward-only)", () => {
    // The tracer bullet walks queued → reconstructing → exporting → succeeded;
    // Moderation/Preprocessing/Postprocessing land in later tickets.
    expect(canTransition("queued", "reconstructing")).toBe(true);
    expect(canTransition("reconstructing", "exporting")).toBe(true);
  });

  it("rejects moving backwards through the pipeline", () => {
    expect(canTransition("exporting", "reconstructing")).toBe(false);
    expect(canTransition("moderating", "queued")).toBe(false);
    expect(canTransition("succeeded", "queued")).toBe(false);
  });

  it("rejects staying in place", () => {
    expect(canTransition("queued", "queued")).toBe(false);
    expect(canTransition("failed", "failed")).toBe(false);
  });

  it("allows failing from any non-terminal state", () => {
    expect(canTransition("queued", "failed")).toBe(true);
    expect(canTransition("moderating", "failed")).toBe(true);
    expect(canTransition("reconstructing", "failed")).toBe(true);
    expect(canTransition("exporting", "failed")).toBe(true);
  });

  it("never leaves a terminal state", () => {
    for (const to of JOB_STATUSES) {
      expect(canTransition("succeeded", to)).toBe(false);
      expect(canTransition("failed", to)).toBe(false);
    }
  });

  it("identifies terminal states", () => {
    expect(isTerminal("succeeded")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("queued")).toBe(false);
    expect(isTerminal("reconstructing")).toBe(false);
  });

  it("assertTransition throws a typed error on an invalid move", () => {
    expect(() => assertTransition("succeeded", "queued")).toThrow(
      InvalidJobTransitionError,
    );
    expect(() => assertTransition("exporting", "reconstructing")).toThrow(
      /exporting.*reconstructing/,
    );
    expect(() => assertTransition("reconstructing", "exporting")).not.toThrow();
  });
});
