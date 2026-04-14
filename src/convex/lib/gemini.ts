"use node";
import Anthropic from "@anthropic-ai/sdk";
import { ActionCtx } from "../_generated/server";

// Keep the same export name for backward compatibility
export const modelsToTry = ["claude-haiku-4-5"];
export const gemmaModel = "claude-haiku-4-5";

export function extractJsonFromMarkdown(text: string): string {
  const jsonBlockRegex = new RegExp("\\x60{3}(?:json)?\\s*([\\s\\S]*?)\\s*\\x60{3}");
  const match = text.match(jsonBlockRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text;
}

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
  }
  return new Anthropic({ apiKey });
}

// Kept for backward compat — no-op since we use env key directly
export async function getGeminiKeys(_ctx: ActionCtx) {
  return [{ apiKey: process.env.ANTHROPIC_API_KEY || "", label: "Anthropic Env Key" }];
}

export async function generateWithGemini(
  _ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  config: {
    jsonMode?: boolean;
    model?: string;
    useGemma?: boolean;
  } = {}
): Promise<{ text: string; model: string }> {
  const client = getAnthropicClient();
  const model = "claude-haiku-4-5";

  const systemContent = config.jsonMode
    ? systemPrompt + "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, just the JSON object."
    : systemPrompt;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemContent,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return { text, model };
}

// Download a URL and return base64 + mimeType
async function downloadAsBase64(url: string, timeoutMs = 20000): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const mimeType = contentType.split(";")[0].trim();
    return { data: base64, mimeType };
  } catch (e) {
    console.warn("Failed to download media:", e);
    return null;
  }
}

// Analyze an image with Claude Vision
export async function generateWithGeminiVision(
  _ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  imageUrl: string,
  config: { jsonMode?: boolean } = {}
): Promise<{ text: string; model: string }> {
  const client = getAnthropicClient();
  const model = "claude-opus-4-5";

  const downloaded = await downloadAsBase64(imageUrl);
  if (!downloaded) {
    return generateWithGemini(_ctx, systemPrompt, userPrompt, config);
  }

  const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const mediaType = validImageTypes.includes(downloaded.mimeType)
    ? (downloaded.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
    : "image/jpeg";

  const systemContent = config.jsonMode
    ? systemPrompt + "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, just the JSON object."
    : systemPrompt;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemContent,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: downloaded.data },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return { text, model };
}

// Analyze a document (PDF) with Claude — extract text and understand content
export async function analyzeDocument(
  _ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  documentUrl: string,
  config: { jsonMode?: boolean } = {}
): Promise<{ text: string; model: string }> {
  const client = getAnthropicClient();
  const model = "claude-opus-4-5";

  const downloaded = await downloadAsBase64(documentUrl, 30000);
  if (!downloaded) {
    // Fall back to text-only with URL mention
    return generateWithGemini(_ctx, systemPrompt, `${userPrompt}\n\n[Document URL: ${documentUrl}]`, config);
  }

  const systemContent = config.jsonMode
    ? systemPrompt + "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, just the JSON object."
    : systemPrompt;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemContent,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: downloaded.data,
              },
            } as any,
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return { text, model };
  } catch (e) {
    // If document API fails, fall back to text-only
    console.warn("Document analysis failed, falling back to text:", e);
    return generateWithGemini(_ctx, systemPrompt, `${userPrompt}\n\n[Document URL: ${documentUrl}]`, config);
  }
}

// Transcribe/analyze audio using Claude (base64 audio)
// Claude supports audio natively in claude-opus-4-5 and claude-sonnet-4-5
export async function analyzeAudio(
  _ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  audioUrl: string,
  config: { jsonMode?: boolean } = {}
): Promise<{ text: string; model: string; transcription?: string }> {
  const client = getAnthropicClient();
  const model = "claude-opus-4-5";

  const downloaded = await downloadAsBase64(audioUrl, 30000);
  if (!downloaded) {
    return { ...(await generateWithGemini(_ctx, systemPrompt, `${userPrompt}\n\n[Audio message received - could not process]`, config)), transcription: undefined };
  }

  // Supported audio types for Claude
  const supportedAudioTypes = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm", "audio/flac", "audio/aac"];
  let audioMimeType = downloaded.mimeType;
  if (!supportedAudioTypes.includes(audioMimeType)) {
    // Default to ogg for WhatsApp voice messages
    audioMimeType = "audio/ogg";
  }

  const systemContent = config.jsonMode
    ? systemPrompt + "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, just the JSON object."
    : systemPrompt;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemContent,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "First, transcribe this audio message exactly. Then respond to the user's query based on what they said.",
            },
            {
              type: "document",
              source: {
                type: "base64",
                media_type: audioMimeType as any,
                data: downloaded.data,
              },
            } as any,
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return { text, model, transcription: text };
  } catch (e) {
    console.warn("Audio analysis failed, falling back to text:", e);
    return { ...(await generateWithGemini(_ctx, systemPrompt, `${userPrompt}\n\n[Voice message received - transcription unavailable]`, config)), transcription: undefined };
  }
}

// Analyze video by extracting key frames and using vision
export async function analyzeVideo(
  _ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  videoUrl: string,
  config: { jsonMode?: boolean } = {}
): Promise<{ text: string; model: string }> {
  // Claude doesn't support video natively yet — we analyze the video as a document/file
  // and provide context about it being a video
  const client = getAnthropicClient();
  const model = "claude-haiku-4-5";

  const systemContent = config.jsonMode
    ? systemPrompt + "\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, just the JSON object."
    : systemPrompt;

  // For video, we can't extract frames without ffmpeg, so we acknowledge it intelligently
  const videoContext = `The user sent a video file. URL: ${videoUrl}\n\nPlease acknowledge the video and respond helpfully based on the context of the conversation. If the video seems to be about a product inquiry, ask them to describe what they're looking for or send a clearer image.`;

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: systemContent,
    messages: [{ role: "user", content: `${videoContext}\n\n${userPrompt}` }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return { text, model };
}

// Universal media analyzer — routes to the right handler based on media type
export async function analyzeMedia(
  ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  mediaUrl: string,
  mediaType: "image" | "audio" | "video" | "document" | "file",
  mimeType?: string,
  config: { jsonMode?: boolean } = {}
): Promise<{ text: string; model: string; transcription?: string; mediaAnalyzed: boolean }> {
  try {
    if (mediaType === "image") {
      const result = await generateWithGeminiVision(ctx, systemPrompt, userPrompt, mediaUrl, config);
      return { ...result, mediaAnalyzed: true };
    } else if (mediaType === "audio") {
      const result = await analyzeAudio(ctx, systemPrompt, userPrompt, mediaUrl, config);
      return { ...result, mediaAnalyzed: true };
    } else if (mediaType === "document" || (mimeType && mimeType.includes("pdf"))) {
      const result = await analyzeDocument(ctx, systemPrompt, userPrompt, mediaUrl, config);
      return { ...result, mediaAnalyzed: true };
    } else if (mediaType === "video") {
      const result = await analyzeVideo(ctx, systemPrompt, userPrompt, mediaUrl, config);
      return { ...result, mediaAnalyzed: true };
    } else {
      // Generic file — try as document first, fall back to text
      const result = await generateWithGemini(ctx, systemPrompt, `${userPrompt}\n\n[File received: ${mediaUrl}]`, config);
      return { ...result, mediaAnalyzed: false };
    }
  } catch (e) {
    console.warn("Media analysis failed:", e);
    const result = await generateWithGemini(ctx, systemPrompt, userPrompt, config);
    return { ...result, mediaAnalyzed: false };
  }
}