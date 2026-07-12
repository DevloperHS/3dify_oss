import sharp from "sharp";

// Preprocessing (ticket 05, spec.md "Preprocessing" responsibility 1):
// server-side downscaling of any Source Image above ~2048×2048px before
// Reconstruction — TripoSR gains nothing beyond its own working resolution,
// so nothing is rejected at the high end. Within-bounds images pass through
// byte-identical (no pointless re-encode). Background removal / foreground
// framing, the stage's other responsibility, currently lives inside the
// Modal TripoSR function (ticket 03) rather than here.

export const MAX_DIMENSION_PX = 2048;

export type PreprocessedImage = {
  bytes: Uint8Array;
  contentType: string;
};

export async function downscaleIfNeeded(
  bytes: Uint8Array,
  contentType: string,
): Promise<PreprocessedImage> {
  const image = sharp(Buffer.from(bytes));
  const { width, height, format } = await image.metadata();
  if (!width || !height) {
    throw new Error("preprocessing could not read image dimensions");
  }
  if (width <= MAX_DIMENSION_PX && height <= MAX_DIMENSION_PX) {
    return { bytes, contentType };
  }

  const resized = await image
    .resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: "inside",
    })
    .toBuffer();
  return {
    bytes: new Uint8Array(resized),
    contentType: format ? `image/${format}` : contentType,
  };
}
