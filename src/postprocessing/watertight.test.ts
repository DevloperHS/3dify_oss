import { readFile } from "node:fs/promises";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { countBoundaryEdges, repairToWatertight } from "./watertight";

// A unit cube as 8 shared vertices / 12 outward-wound triangles, with a
// distinct color per vertex. `openTop: true` drops the two top-face
// triangles, leaving a square hole (4 boundary edges — one loop).
async function buildCubeGlb(openTop: boolean): Promise<Uint8Array> {
  // prettier-ignore
  const positions = new Float32Array([
    0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0, // z=0
    0, 0, 1,  1, 0, 1,  1, 1, 1,  0, 1, 1, // z=1
  ]);
  const colors = new Float32Array(8 * 3);
  for (let i = 0; i < 8; i++) colors.set([i / 7, 0.5, 0.25], i * 3);
  // prettier-ignore
  const triangles = [
    [0, 2, 1], [0, 3, 2], // bottom
    [4, 5, 6], [4, 6, 7], // top
    [0, 1, 5], [0, 5, 4], // front
    [2, 3, 7], [2, 7, 6], // back
    [0, 4, 7], [0, 7, 3], // left
    [1, 2, 6], [1, 6, 5], // right
  ];
  const kept = openTop ? [...triangles.slice(0, 2), ...triangles.slice(4)] : triangles;

  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute(
      "POSITION",
      doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer),
    )
    .setAttribute(
      "COLOR_0",
      doc.createAccessor().setType("VEC3").setArray(colors).setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint32Array(kept.flat()))
        .setBuffer(buffer),
    );
  const mesh = doc.createMesh().addPrimitive(prim);
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}

// Two open-top cubes fused at a single vertex: cube B reuses cube A's top
// corner 6 as one of its own top corners, so the two hole loops pinch
// together there — vertex 6 starts one boundary edge per hole. Real TripoSR
// meshes produce this shape (found via a live reconstruction, 2026-07-13);
// a start→end map that keeps only one edge per vertex drops a hole.
async function buildPinchedCubesGlb(): Promise<Uint8Array> {
  // prettier-ignore
  const positions = new Float32Array([
    0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0, // cube A, z=0
    0, 0, 1,  1, 0, 1,  1, 1, 1,  0, 1, 1, // cube A, z=1 (6 is shared)
    2, 0, 0,  3, 0, 0,  3, 1, 0,  2, 1, 0, // cube B, z=0
    2, 0, 1,  3, 0, 1,            2, 1, 1, // cube B, z=1 minus the shared corner
  ]);
  const colors = new Float32Array(15 * 3);
  for (let i = 0; i < 15; i++) colors.set([i / 14, 0.5, 0.25], i * 3);
  // prettier-ignore
  const openCube = [
    [0, 2, 1], [0, 3, 2], // bottom
    [0, 1, 5], [0, 5, 4], // front
    [2, 3, 7], [2, 7, 6], // back
    [0, 4, 7], [0, 7, 3], // left
    [1, 2, 6], [1, 6, 5], // right
  ];
  const cubeB = [8, 9, 10, 11, 12, 13, 6, 14]; // local → global, corner 6 shared
  const triangles = [
    ...openCube,
    ...openCube.map((tri) => tri.map((v) => cubeB[v])),
  ];

  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute(
      "POSITION",
      doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer),
    )
    .setAttribute(
      "COLOR_0",
      doc.createAccessor().setType("VEC3").setArray(colors).setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint32Array(triangles.flat()))
        .setBuffer(buffer),
    );
  const mesh = doc.createMesh().addPrimitive(prim);
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}

const CHAIR_FIXTURE = path.join(
  process.cwd(),
  ".scratch/wayfinder/image-to-3d-mvp-spec/prototype/output-chair.glb",
);

describe("countBoundaryEdges", () => {
  it("is 0 for a closed cube and 4 for a cube missing its top face", async () => {
    expect(await countBoundaryEdges(await buildCubeGlb(false))).toBe(0);
    expect(await countBoundaryEdges(await buildCubeGlb(true))).toBe(4);
  });
});

describe("repairToWatertight", () => {
  it("caps the hole in an open cube and reports one hole filled", async () => {
    const { glb, holesFilled } = await repairToWatertight(
      await buildCubeGlb(true),
    );
    expect(holesFilled).toBe(1);
    expect(await countBoundaryEdges(glb)).toBe(0);

    // 10 original triangles + a 4-triangle centroid fan over the square hole.
    const doc = await new NodeIO().readBinary(glb);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    expect(prim.getIndices()!.getCount()).toBe((10 + 4) * 3);
  });

  it("leaves an already-watertight cube alone", async () => {
    const { glb, holesFilled } = await repairToWatertight(
      await buildCubeGlb(false),
    );
    expect(holesFilled).toBe(0);
    expect(await countBoundaryEdges(glb)).toBe(0);
  });

  it("preserves the original vertex colors through a repair", async () => {
    const { glb } = await repairToWatertight(await buildCubeGlb(true));
    const doc = await new NodeIO().readBinary(glb);
    const color = doc
      .getRoot()
      .listMeshes()[0]
      .listPrimitives()[0]
      .getAttribute("COLOR_0")!;
    const element: number[] = [];
    for (let i = 0; i < 8; i++) {
      color.getElement(i, element);
      expect(element[0]).toBeCloseTo(i / 7, 5);
      expect(element[1]).toBeCloseTo(0.5, 5);
      expect(element[2]).toBeCloseTo(0.25, 5);
    }
  });

  it("caps two holes pinched together at a shared vertex", async () => {
    const raw = await buildPinchedCubesGlb();
    expect(await countBoundaryEdges(raw)).toBe(8); // two square hole loops

    // The walk may close the pinched pair as one figure-eight trail or as
    // two separate loops — either way every boundary edge must be capped.
    const { glb, holesFilled } = await repairToWatertight(raw);
    expect(holesFilled).toBeGreaterThanOrEqual(1);
    expect(await countBoundaryEdges(glb)).toBe(0);
  });

  it("makes real TripoSR output (the prototype chair) watertight, colors intact", async () => {
    const raw = new Uint8Array(await readFile(CHAIR_FIXTURE));
    expect(await countBoundaryEdges(raw)).toBeGreaterThan(0);

    const { glb, holesFilled } = await repairToWatertight(raw);
    expect(holesFilled).toBeGreaterThan(0);
    expect(await countBoundaryEdges(glb)).toBe(0);

    const doc = await new NodeIO().readBinary(glb);
    const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    expect(prim.getAttribute("COLOR_0")).toBeTruthy();
  });
});
