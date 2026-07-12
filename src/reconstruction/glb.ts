// The GLB (glTF 2.0 binary) container magic, shared by every engine that
// builds or validates GLB bytes.

export const GLB_MAGIC = 0x46546c67; // "glTF", little-endian

export function hasGlbMagic(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) ===
      GLB_MAGIC
  );
}
