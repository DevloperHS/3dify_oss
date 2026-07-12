import sharp from "sharp";

// Upload constraints (ticket 05, spec.md "Upload constraints"): JPEG/PNG/WebP
// only, ≤10MB, ≥256×256. No upper resolution bound — oversized images are
// downscaled during Preprocessing, not rejected. Format is sniffed from magic
// bytes, never trusted from the client's MIME type; dimensions come from
// actually decoding the header with sharp.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // Cloudinary free-plan cap
export const MIN_DIMENSION_PX = 256;

export type AcceptedFormat = "jpeg" | "png" | "webp";

export type UploadValidation =
  | { ok: true; format: AcceptedFormat; width: number; height: number }
  | { ok: false; error: string };

export async function validateUpload(
  bytes: Uint8Array,
): Promise<UploadValidation> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "image is larger than the 10MB limit" };
  }

  const sniffed = sniffFormat(bytes);
  if (sniffed === "heic") {
    return {
      ok: false,
      error:
        "HEIC is not supported — convert the photo to JPEG, PNG, or WebP and upload again",
    };
  }
  if (sniffed === "jpeg" || sniffed === "png" || sniffed === "webp") {
    let width: number | undefined;
    let height: number | undefined;
    try {
      ({ width, height } = await sharp(Buffer.from(bytes)).metadata());
    } catch {
      return { ok: false, error: "the image file appears to be corrupt" };
    }
    if (!width || !height) {
      return { ok: false, error: "the image file appears to be corrupt" };
    }
    if (width < MIN_DIMENSION_PX || height < MIN_DIMENSION_PX) {
      return {
        ok: false,
        error: `image is ${width}×${height}px — the minimum is ${MIN_DIMENSION_PX}×${MIN_DIMENSION_PX}px`,
      };
    }
    return { ok: true, format: sniffed, width, height };
  }
  return {
    ok: false,
    error: "unsupported image format — upload a JPEG, PNG, or WebP",
  };
}

function sniffFormat(
  bytes: Uint8Array,
): AcceptedFormat | "heic" | "unknown" {
  const ascii = (at: number, length: number) =>
    String.fromCharCode(...bytes.subarray(at, at + length));

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    return "webp";
  }
  // ISO-BMFF ftyp box with an HEIC-family brand (what iPhones upload).
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4).toLowerCase();
    if (["heic", "heix", "hevc", "heif", "mif1", "msf1"].includes(brand)) {
      return "heic";
    }
  }
  return "unknown";
}
