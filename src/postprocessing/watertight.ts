import { Document, NodeIO, Primitive } from "@gltf-transform/core";
import { PipelineFailure } from "@/jobs/failures";

// Postprocessing — mesh repair for watertight export (ticket 04, spec.md
// "Postprocessing"). TripoSR's raw output has open boundary loops (holes)
// where occluded surfaces were never reconstructed. This module finds every
// boundary loop and caps it with a centroid fan, averaging all vertex
// attributes (including COLOR_0 — vertex colors survive; no UV-unwrapping,
// out of scope per spec).
//
// "Watertight" here means no boundary edges: every edge is shared by at
// least two triangles. That is exactly the property hole-capping restores;
// non-manifold edges (3+ faces), which marching-cubes output can contain,
// are already closed and are left alone.

export type RepairResult = {
  glb: Uint8Array;
  holesFilled: number;
};

export async function repairToWatertight(
  glb: Uint8Array,
): Promise<RepairResult> {
  const io = new NodeIO();
  const doc = await io.readBinary(glb);

  let holesFilled = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      holesFilled += capHoles(doc, prim);
    }
  }

  const repaired = await io.writeBinary(doc);
  const remaining = await countBoundaryEdges(repaired);
  if (remaining > 0) {
    // Repair is deterministic, but reconstruction isn't necessarily — a
    // fresh mesh from a retry may repair cleanly. Transient.
    throw new PipelineFailure(
      "transient",
      "the generated 3D model could not be cleaned up",
      `mesh is not watertight after repair: ${remaining} boundary edges remain`,
    );
  }
  return { glb: repaired, holesFilled };
}

export async function countBoundaryEdges(glb: Uint8Array): Promise<number> {
  const doc = await new NodeIO().readBinary(glb);
  let count = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      for (const ends of boundaryDirectedEdges(readIndices(prim)).values()) {
        count += ends.length;
      }
    }
  }
  return count;
}

// Vertex indices fit comfortably below 2^21 (~2M) for TripoSR-scale meshes;
// pack an edge into one float64-safe integer key.
const KEY = 1 << 21;
const edgeKey = (a: number, b: number) => (a < b ? a * KEY + b : b * KEY + a);

function readIndices(prim: Primitive): Uint32Array {
  const accessor = prim.getIndices();
  if (accessor) return new Uint32Array(accessor.getArray()!);
  // Non-indexed triangles: implicit 0..n-1.
  const count = prim.getAttribute("POSITION")!.getCount();
  return new Uint32Array(Array.from({ length: count }, (_, i) => i));
}

// Directed edges (a→b) whose undirected edge belongs to exactly one
// triangle — the hole boundaries, oriented as their owning triangle winds.
// A start vertex can have several outgoing boundary edges (two holes pinched
// together at one vertex — real TripoSR output does this), so the map keeps
// every end, not just the last one seen.
function boundaryDirectedEdges(indices: Uint32Array): Map<number, number[]> {
  const undirectedCount = new Map<number, number>();
  for (let i = 0; i < indices.length; i += 3) {
    for (const [a, b] of triangleEdges(indices, i)) {
      const key = edgeKey(a, b);
      undirectedCount.set(key, (undirectedCount.get(key) ?? 0) + 1);
    }
  }
  const boundary = new Map<number, number[]>();
  for (let i = 0; i < indices.length; i += 3) {
    for (const [a, b] of triangleEdges(indices, i)) {
      if (undirectedCount.get(edgeKey(a, b)) === 1) {
        const ends = boundary.get(a);
        if (ends) ends.push(b);
        else boundary.set(a, [b]);
      }
    }
  }
  return boundary;
}

function triangleEdges(
  indices: Uint32Array,
  offset: number,
): [number, number][] {
  const [a, b, c] = [indices[offset], indices[offset + 1], indices[offset + 2]];
  return [
    [a, b],
    [b, c],
    [c, a],
  ];
}

// Walks each boundary loop and caps it: one new centroid vertex (every
// attribute averaged over the loop) plus one triangle per boundary edge,
// wound as the missing neighbor of the existing triangle. Returns the number
// of loops capped.
function capHoles(doc: Document, prim: Primitive): number {
  const indices = readIndices(prim);
  const boundary = boundaryDirectedEdges(indices);
  let edgeCount = 0;
  for (const ends of boundary.values()) edgeCount += ends.length;
  if (edgeCount === 0) return 0;

  const attributes = prim.listSemantics().map((semantic) => ({
    semantic,
    accessor: prim.getAttribute(semantic)!,
  }));
  const vertexCount = attributes[0].accessor.getCount();

  // Denormalized float copies of every attribute, extended as loops add
  // centroid vertices.
  const attributeData = attributes.map(({ accessor }) => {
    const size = accessor.getElementSize();
    const data: number[] = new Array(vertexCount * size);
    const element: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      accessor.getElement(i, element);
      for (let j = 0; j < size; j++) data[i * size + j] = element[j];
    }
    return { size, data };
  });

  const newTriangles: number[] = [];
  let nextVertex = vertexCount;
  let holesFilled = 0;

  // Walk closed trails, consuming one directed edge per step. Each step pops
  // an edge, so a vertex shared by two holes (multiple outgoing boundary
  // edges) is passed through once per hole instead of losing an edge. A trail
  // that revisits a vertex (figure-eight hole) still caps cleanly: every
  // boundary edge gets its missing neighbor triangle, and the repeated
  // vertex's spoke edge is shared by four cap triangles — even, so not a
  // boundary. Leftover edges of a partially-walked component are picked up
  // as their own closed trails on later iterations.
  for (const start of boundary.keys()) {
    let outs: number[] | undefined;
    while ((outs = boundary.get(start)) && outs.length > 0) {
      const loop = [start];
      let current = outs.pop()!;
      // Walk start → ... → start. A walk that dead-ends (unbalanced boundary
      // vertex with no continuation) is abandoned; repairToWatertight's final
      // verification will surface it.
      while (current !== start) {
        const next = boundary.get(current);
        if (!next || next.length === 0) break;
        loop.push(current);
        current = next.pop()!;
      }
      if (current !== start || loop.length < 3) continue;

      // Centroid vertex: every attribute is the loop average.
      for (const { size, data } of attributeData) {
        for (let j = 0; j < size; j++) {
          let sum = 0;
          for (const vertex of loop) sum += data[vertex * size + j];
          data.push(sum / loop.length);
        }
      }
      // Boundary edge a→b winds like its owning triangle, so the cap triangle
      // (the missing neighbor) winds b→a→centroid.
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        newTriangles.push(b, a, nextVertex);
      }
      nextVertex++;
      holesFilled++;
    }
  }

  if (holesFilled === 0) return 0;

  for (let i = 0; i < attributes.length; i++) {
    attributes[i].accessor
      .setArray(new Float32Array(attributeData[i].data))
      .setNormalized(false);
  }
  const merged = new Uint32Array(indices.length + newTriangles.length);
  merged.set(indices);
  merged.set(newTriangles, indices.length);
  const indexAccessor =
    prim.getIndices() ??
    doc.createAccessor().setType("SCALAR").setBuffer(doc.getRoot().listBuffers()[0]);
  indexAccessor.setArray(merged);
  prim.setIndices(indexAccessor);
  return holesFilled;
}
