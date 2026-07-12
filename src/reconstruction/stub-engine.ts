import type {
  ReconstructionEngine,
  ReconstructionInput,
  ReconstructionResult,
} from "./engine";

// Returns the same placeholder mesh for every input: a vertex-colored cube,
// built as a GLB (glTF 2.0 binary) container from scratch. Vertex colors and
// no texture mirror the shape of real TripoSR output, so the viewer built
// against this stub keeps working when ticket 03 swaps the real engine in.
export class StubReconstructionEngine implements ReconstructionEngine {
  async reconstruct(_input: ReconstructionInput): Promise<ReconstructionResult> {
    return { glb: buildCubeGlb() };
  }
}

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

function buildCubeGlb(): Uint8Array {
  // 24 vertices: 4 per face, so each face can carry a flat color.
  // Winding is irrelevant — the material is double-sided.
  const h = 0.5;
  // prettier-ignore
  const facePositions: number[][][] = [
    [[ h,-h,-h],[ h, h,-h],[ h, h, h],[ h,-h, h]], // +X
    [[-h,-h, h],[-h, h, h],[-h, h,-h],[-h,-h,-h]], // -X
    [[-h, h,-h],[-h, h, h],[ h, h, h],[ h, h,-h]], // +Y
    [[-h,-h, h],[-h,-h,-h],[ h,-h,-h],[ h,-h, h]], // -Y
    [[-h,-h, h],[ h,-h, h],[ h, h, h],[-h, h, h]], // +Z
    [[ h,-h,-h],[-h,-h,-h],[-h, h,-h],[ h, h,-h]], // -Z
  ];
  // prettier-ignore
  const faceColors: number[][] = [
    [0.91, 0.30, 0.24], // +X red
    [0.18, 0.80, 0.44], // -X green
    [0.20, 0.60, 0.86], // +Y blue
    [0.95, 0.77, 0.06], // -Y yellow
    [0.61, 0.35, 0.71], // +Z purple
    [0.90, 0.49, 0.13], // -Z orange
  ];

  const positions = new Float32Array(24 * 3);
  const colors = new Float32Array(24 * 3);
  const indices = new Uint16Array(36);
  facePositions.forEach((corners, face) => {
    corners.forEach((corner, i) => {
      positions.set(corner, (face * 4 + i) * 3);
      colors.set(faceColors[face], (face * 4 + i) * 3);
    });
    indices.set(
      [0, 1, 2, 0, 2, 3].map((i) => face * 4 + i),
      face * 6,
    );
  });

  const positionBytes = new Uint8Array(positions.buffer);
  const colorBytes = new Uint8Array(colors.buffer);
  const indexBytes = new Uint8Array(indices.buffer);
  const binLength = align4(
    positionBytes.byteLength + colorBytes.byteLength + indexBytes.byteLength,
  );
  const bin = new Uint8Array(binLength);
  bin.set(positionBytes, 0);
  bin.set(colorBytes, positionBytes.byteLength);
  bin.set(indexBytes, positionBytes.byteLength + colorBytes.byteLength);

  const gltf = {
    asset: { version: "2.0", generator: "maker stub reconstruction engine" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "placeholder" }],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        doubleSided: true,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: FLOAT,
        count: 24,
        type: "VEC3",
        min: [-h, -h, -h],
        max: [h, h, h],
      },
      { bufferView: 1, componentType: FLOAT, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: UNSIGNED_SHORT, count: 36, type: "SCALAR" },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positionBytes.byteLength,
        target: ARRAY_BUFFER,
      },
      {
        buffer: 0,
        byteOffset: positionBytes.byteLength,
        byteLength: colorBytes.byteLength,
        target: ARRAY_BUFFER,
      },
      {
        buffer: 0,
        byteOffset: positionBytes.byteLength + colorBytes.byteLength,
        byteLength: indexBytes.byteLength,
        target: ELEMENT_ARRAY_BUFFER,
      },
    ],
    buffers: [{ byteLength: binLength }],
  };

  // GLB container: 12-byte header, then a space-padded JSON chunk, then the
  // zero-padded BIN chunk. All chunks must be 4-byte aligned.
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPadded = new Uint8Array(align4(jsonBytes.byteLength)).fill(0x20);
  jsonPadded.set(jsonBytes);

  const totalLength = 12 + 8 + jsonPadded.byteLength + 8 + binLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonPadded.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  glb.set(jsonPadded, 20);
  const binHeaderOffset = 20 + jsonPadded.byteLength;
  view.setUint32(binHeaderOffset, binLength, true);
  view.setUint32(binHeaderOffset + 4, 0x004e4942, true); // "BIN\0"
  glb.set(bin, binHeaderOffset + 8);
  return glb;
}

function align4(n: number): number {
  return Math.ceil(n / 4) * 4;
}
