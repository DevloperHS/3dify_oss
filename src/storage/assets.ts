import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Asset (GLB) storage — a plain module boundary over any S3-compatible store
// (spec.md "Export/Storage", amended: local dev uses the MinIO container from
// docker-compose; production points the same env vars at Backblaze B2 or
// Cloudflare R2). Downloads are served through short-lived presigned URLs for
// now; production serving via a bucket custom domain is a deploy-time
// concern, not a code change here.

export type AssetStorage = {
  uploadGlb(key: string, bytes: Uint8Array): Promise<void>;
  downloadUrl(key: string): Promise<string>;
};

let client: S3Client | null = null;
let bucket = "";

function getS3Client() {
  if (client) return { client, bucket };
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  bucket = process.env.S3_BUCKET ?? "";
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Asset storage is not configured — set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET (see .env.example)",
    );
  }
  client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // MinIO requires path-style addressing; R2 and B2 accept it too.
    forcePathStyle: true,
  });
  return { client, bucket };
}

const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export const assetStorage: AssetStorage = {
  async uploadGlb(key, bytes) {
    const { client, bucket } = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: "model/gltf-binary",
      }),
    );
  },

  async downloadUrl(key) {
    const { client, bucket } = getS3Client();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
  },
};
