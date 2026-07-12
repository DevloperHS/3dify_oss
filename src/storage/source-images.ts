import { v2 as cloudinary } from "cloudinary";

// Source Image storage — a plain module boundary wrapping Cloudinary (spec.md
// "Upload/Ingestion"). Callers depend on the SourceImageStorage type so tests
// can substitute a fake; only this module touches the Cloudinary SDK.

export type StoredSourceImage = {
  url: string;
  publicId: string;
};

export type UploadOptions = {
  // Submit the image to Cloudinary's aws_rek moderation add-on, with the
  // verdict delivered to `notificationUrl` (ticket 06).
  moderation?: { notificationUrl: string };
};

export type SourceImageStorage = {
  upload(
    bytes: Uint8Array,
    contentType: string,
    options?: UploadOptions,
  ): Promise<StoredSourceImage>;
  // Removes a stored Source Image (ticket 09's retention sweep). An image
  // that's already gone reports "not-found" rather than throwing — the sweep
  // treats both as success.
  destroy(publicId: string): Promise<"deleted" | "not-found">;
};

let configured = false;

function configureCloudinary() {
  if (configured) return;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (see .env.example)",
    );
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
  configured = true;
}

export const sourceImageStorage: SourceImageStorage = {
  async upload(bytes, contentType, options) {
    configureCloudinary();
    const dataUri = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "source-images",
      resource_type: "image",
      ...(options?.moderation
        ? {
            moderation: "aws_rek",
            notification_url: options.moderation.notificationUrl,
          }
        : {}),
    });
    return { url: result.secure_url, publicId: result.public_id };
  },

  async destroy(publicId) {
    configureCloudinary();
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });
    if (result.result === "ok") return "deleted";
    if (result.result === "not found") return "not-found";
    throw new Error(`Cloudinary destroy failed: ${result.result}`);
  },
};
