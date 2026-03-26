"use node";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getB2Client(): S3Client {
  const endpoint = process.env.B2_ENDPOINT;
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APPLICATION_KEY;

  if (!endpoint || !keyId || !appKey) {
    throw new Error("BackBlaze B2 not configured. Set B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY in environment variables.");
  }

  return new S3Client({
    endpoint: `https://${endpoint}`,
    region: "us-east-1",
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: appKey,
    },
    forcePathStyle: true,
  });
}

/**
 * Upload a file buffer to BackBlaze B2 and return a permanent public URL.
 */
export async function uploadToMega(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<string> {
  const bucketName = process.env.B2_BUCKET_NAME;
  const bucketUrl = process.env.B2_BUCKET_URL;

  if (!bucketName || !bucketUrl) {
    throw new Error("B2_BUCKET_NAME and B2_BUCKET_URL environment variables are not set.");
  }

  const client = getB2Client();
  const key = `media/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: mimeType || "application/octet-stream",
  }));

  const baseUrl = bucketUrl.endsWith("/") ? bucketUrl.slice(0, -1) : bucketUrl;
  return `${baseUrl}/${key}`;
}

/**
 * Upload a Blob to BackBlaze B2 and return a permanent public URL.
 */
export async function uploadBlobToMega(
  blob: Blob,
  fileName: string
): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return uploadToMega(buffer, fileName, blob.type || undefined);
}