import { describe, expect, it } from "vitest";
import { StubReconstructionEngine } from "./stub-engine";

// Parses the GLB container format (glTF 2.0 binary) enough to verify the stub
// produces a file any glTF loader will accept: header magic/version/length,
// chunk layout, parseable JSON chunk, and a BIN chunk that covers the byte
// ranges the JSON declares.
function parseGlb(glb: Uint8Array) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);

  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  const jsonText = new TextDecoder().decode(
    glb.subarray(20, 20 + jsonChunkLength),
  );

  const binHeaderOffset = 20 + jsonChunkLength;
  const binChunkLength = view.getUint32(binHeaderOffset, true);
  const binChunkType = view.getUint32(binHeaderOffset + 4, true);

  return {
    magic,
    version,
    declaredLength,
    jsonChunkLength,
    jsonChunkType,
    binChunkLength,
    binChunkType,
    json: JSON.parse(jsonText),
  };
}

describe("StubReconstructionEngine", () => {
  const engine = new StubReconstructionEngine();

  it("returns a well-formed GLB container", async () => {
    const { glb } = await engine.reconstruct({
      imageBytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
    const parsed = parseGlb(glb);

    expect(parsed.magic).toBe(0x46546c67); // "glTF"
    expect(parsed.version).toBe(2);
    expect(parsed.declaredLength).toBe(glb.byteLength);
    expect(parsed.jsonChunkType).toBe(0x4e4f534a); // "JSON"
    expect(parsed.binChunkType).toBe(0x004e4942); // "BIN\0"
    expect(parsed.jsonChunkLength % 4).toBe(0);
    expect(parsed.binChunkLength % 4).toBe(0);
  });

  it("declares a single vertex-colored mesh consistent with its binary data", async () => {
    const { glb } = await engine.reconstruct({
      imageBytes: new Uint8Array(),
      contentType: "image/jpeg",
    });
    const { json, binChunkLength } = parseGlb(glb);

    expect(json.asset.version).toBe("2.0");
    expect(json.meshes).toHaveLength(1);

    const primitive = json.meshes[0].primitives[0];
    // Vertex colors, no texture — mirrors the shape of real TripoSR output.
    expect(primitive.attributes.COLOR_0).toBeDefined();
    expect(primitive.attributes.POSITION).toBeDefined();
    expect(primitive.indices).toBeDefined();

    // Every accessor's byte range must fit inside its bufferView, and every
    // bufferView inside the BIN chunk.
    expect(json.buffers).toHaveLength(1);
    expect(json.buffers[0].byteLength).toBeLessThanOrEqual(binChunkLength);
    for (const bufferView of json.bufferViews) {
      expect(
        (bufferView.byteOffset ?? 0) + bufferView.byteLength,
      ).toBeLessThanOrEqual(json.buffers[0].byteLength);
    }

    const position = json.accessors[primitive.attributes.POSITION];
    expect(position.type).toBe("VEC3");
    expect(position.min).toHaveLength(3);
    expect(position.max).toHaveLength(3);

    const indices = json.accessors[primitive.indices];
    expect(indices.count % 3).toBe(0); // whole triangles
  });

  it("is deterministic — same placeholder bytes every call", async () => {
    const a = await engine.reconstruct({
      imageBytes: new Uint8Array([1]),
      contentType: "image/png",
    });
    const b = await engine.reconstruct({
      imageBytes: new Uint8Array([2]),
      contentType: "image/webp",
    });
    expect(Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
  });
});
