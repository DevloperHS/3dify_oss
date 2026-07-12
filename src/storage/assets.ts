import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Asset (GLB) storage — a plain module boundary wrapping Cloudflare R2 via its
// S3-compatible API (spec.md "Export/Storage"). Downloads are served through
// short-lived presigned URLs for now; production serving via a custom domain
// on the bucket is a deploy-time concern, not a code change here.

export type AssetStorage = {
  uploadGlb(key: string, bytes: Uint8Array): Promise<void>;
  downloadUrl(key: string): Promise<string>;
};

let client: S3Client | null = null;
let bucket = "";

function r2() {
  if (client) return { client, bucket };
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  bucket = process.env.R2_BUCKET ?? "";
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (see .env.example)",
    );
  }
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export const assetStorage: AssetStorage = {
  async uploadGlb(key, bytes) {
    const { client, bucket } = r2();
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
    const { client, bucket } = r2();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    });
  },
};
