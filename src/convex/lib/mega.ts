"use node";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getB2Client(): S3Client {
  const endpoint = process.env.B2_ENDPOINT;
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APPLICATION_KEY;

  if (!endpoint || !keyId || !appKey) {
    throw new Error("BackBlaze B2 not configured. Set B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY.");
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
 * Upload a Buffer to B2 and return a pre-signed URL valid for 7 days.
 */
export async function uploadToMega(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<string> {
  const bucketName = process.env.B2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("B2_BUCKET_NAME environment variable is not set.");
  }

  const client = getB2Client();
  const key = `media/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: mimeType || "application/octet-stream",
  }));

  // Generate a pre-signed URL valid for 7 days (max allowed)
  const getCommand = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const presignedUrl = await getSignedUrl(client, getCommand, { expiresIn: 604800 });
  return presignedUrl;
}

/**
 * Upload a Blob to B2 and return a pre-signed URL valid for 7 days.
 */
export async function uploadBlobToMega(
  blob: Blob,
  fileName: string
): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return uploadToMega(buffer, fileName, blob.type || undefined);
}