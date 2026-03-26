"use node";

/**
 * Legacy stub — B2 upload is no longer used.
 * Media is stored in Convex storage and uploaded directly to WhatsApp API.
 * WhatsApp media IDs are cached to avoid re-uploading the same file.
 */

export async function uploadToMega(
  _buffer: Buffer,
  _fileName: string,
  _mimeType?: string
): Promise<string> {
  throw new Error("uploadToMega is deprecated. Media is now stored in Convex storage and sent directly via WhatsApp API.");
}

export async function uploadBlobToMega(
  _blob: Blob,
  _fileName: string
): Promise<string> {
  throw new Error("uploadBlobToMega is deprecated. Media is now stored in Convex storage and sent directly via WhatsApp API.");
}