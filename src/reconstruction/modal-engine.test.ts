import { describe, expect, it } from "vitest";
import { PipelineFailure } from "@/jobs/failures";
import {
  ModalReconstructionEngine,
  modalEngineFromEnv,
} from "./modal-engine";

// A minimal valid-enough GLB payload: correct magic ("glTF" little-endian),
// version 2. The engine only sanity-checks the header, it does not parse.
function glbBytes() {
  const bytes = new Uint8Array(12 + 64);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  return bytes;
}

const options = {
  endpointUrl: "https://example--maker-triposr.modal.run/",
  modalKey: "wk-test-key",
  modalSecret: "ws-test-secret",
};

function engineWith(fetchFn: typeof fetch, timeoutMs?: number) {
  return new ModalReconstructionEngine({ ...options, timeoutMs, fetchFn });
}

describe("ModalReconstructionEngine", () => {
  it("POSTs the image bytes with content type and Modal proxy-auth headers", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const glb = glbBytes();
    const engine = engineWith(async (url, init) => {
      captured = { url: String(url), init: init! };
      return new Response(glb.buffer, { status: 200 });
    });

    const imageBytes = new Uint8Array([9, 8, 7]);
    const result = await engine.reconstruct({
      imageBytes,
      contentType: "image/jpeg",
    });

    expect(captured?.url).toBe(options.endpointUrl);
    expect(captured?.init.method).toBe("POST");
    const headers = new Headers(captured?.init.headers);
    expect(headers.get("Content-Type")).toBe("image/jpeg");
    expect(headers.get("Modal-Key")).toBe(options.modalKey);
    expect(headers.get("Modal-Secret")).toBe(options.modalSecret);
    expect(new Uint8Array(captured?.init.body as ArrayBuffer)).toEqual(
      imageBytes,
    );
    expect(Buffer.from(result.glb).equals(Buffer.from(glb))).toBe(true);
  });

  it("throws on a non-2xx response, surfacing the status", async () => {
    const engine = engineWith(
      async () => new Response("boom", { status: 500 }),
    );
    await expect(
      engine.reconstruct({ imageBytes: new Uint8Array([1]), contentType: "image/png" }),
    ).rejects.toThrow(/500/);
  });

  it.each([
    [500, "transient"],
    [429, "transient"],
    [422, "terminal"],
  ] as const)("categorizes HTTP %i as %s, with a provider-free user reason", async (status, category) => {
    const engine = engineWith(async () => new Response("x", { status }));
    const error = await engine
      .reconstruct({ imageBytes: new Uint8Array([1]), contentType: "image/png" })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(PipelineFailure);
    const failure = error as PipelineFailure;
    expect(failure.category).toBe(category);
    expect(failure.userFacingReason).not.toMatch(/modal|triposr|http|\d{3}/i);
  });

  it("categorizes a timeout as transient", async () => {
    const engine = engineWith(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
      10,
    );
    const error = await engine
      .reconstruct({ imageBytes: new Uint8Array([1]), contentType: "image/png" })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(PipelineFailure);
    expect((error as PipelineFailure).category).toBe("transient");
  });

  it("throws when the response body is not a GLB", async () => {
    const engine = engineWith(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4, 5]).buffer, { status: 200 }),
    );
    await expect(
      engine.reconstruct({ imageBytes: new Uint8Array([1]), contentType: "image/png" }),
    ).rejects.toThrow(/GLB/);
  });

  it("aborts the request once timeoutMs elapses", async () => {
    // A fetch that never resolves on its own — it only rejects when the
    // engine's timeout signal fires.
    const engine = engineWith(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) reject(new Error("no signal passed to fetch"));
          signal?.addEventListener("abort", () => reject(signal.reason));
        }),
      20,
    );
    await expect(
      engine.reconstruct({ imageBytes: new Uint8Array([1]), contentType: "image/png" }),
    ).rejects.toThrow(/timeout|timed out/i);
  });
});

describe("modalEngineFromEnv", () => {
  it("throws a message naming every missing env var", () => {
    expect(() => modalEngineFromEnv({})).toThrow(
      /MODAL_TRIPOSR_URL[\s\S]*MODAL_KEY[\s\S]*MODAL_SECRET/,
    );
  });

  it("rejects a placeholder endpoint URL at startup", () => {
    expect(() =>
      modalEngineFromEnv({
        MODAL_TRIPOSR_URL: "replace-me",
        MODAL_KEY: options.modalKey,
        MODAL_SECRET: options.modalSecret,
      }),
    ).toThrow(/not a valid URL/);
  });

  it("builds an engine when all vars are present", () => {
    const engine = modalEngineFromEnv({
      MODAL_TRIPOSR_URL: options.endpointUrl,
      MODAL_KEY: options.modalKey,
      MODAL_SECRET: options.modalSecret,
    });
    expect(engine).toBeInstanceOf(ModalReconstructionEngine);
  });
});
