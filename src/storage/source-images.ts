import { v2 as cloudinary } from "cloudinary";

// Source Image storage — a plain module boundary wrapping Cloudinary (spec.md
// "Upload/Ingestion"). Callers depend on the SourceImageStorage type so tests
// can substitute a fake; only this module touches the Cloudinary SDK.

export type StoredSourceImage = {
  url: string;
  publicId: string;
};

export type SourceImageStorage = {
  upload(bytes: Uint8Array, contentType: string): Promise<StoredSourceImage>;
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
  async upload(bytes, contentType) {
    configureCloudinary();
    const dataUri = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "source-images",
      resource_type: "image",
    });
    return { url: result.secure_url, publicId: result.public_id };
  },
};
