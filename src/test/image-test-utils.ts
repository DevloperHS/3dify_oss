import sharp from "sharp";

// Real encoded images for tests that exercise upload validation and
// preprocessing — magic-byte sniffing and dimension checks need actual
// bytes, not fakes.

export async function testImage(
  format: "jpeg" | "png" | "webp",
  width: number,
  height: number,
): Promise<Uint8Array> {
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 80, b: 40 },
    },
  });
  const buffer = await base.toFormat(format).toBuffer();
  return new Uint8Array(buffer);
}

// A minimal HEIC header (ftyp box, brand "heic") — enough for format
// sniffing; sharp can't encode HEIC without a plugin, and validation must
// reject it before ever parsing.
export function fakeHeicBytes(): Uint8Array {
  const bytes = new Uint8Array(1024);
  const ascii = (s: string, at: number) => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
  };
  new DataView(bytes.buffer).setUint32(0, 24, false); // box size
  ascii("ftyp", 4);
  ascii("heic", 8); // major brand
  return bytes;
}

export function fakeGifBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  const header = "GIF89a";
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i);
  return bytes;
}
