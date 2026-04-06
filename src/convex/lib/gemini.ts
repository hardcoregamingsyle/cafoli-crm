"use node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";

export const modelsToTry = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

export const gemmaModel = "gemma-3-27b-it";

export function extractJsonFromMarkdown(text: string): string {
  // Try to find JSON inside markdown code blocks
  // Using new RegExp with hex code for backtick (\x60) to avoid markdown parsing issues
  const jsonBlockRegex = new RegExp("\\x60{3}(?:json)?\\s*([\\s\\S]*?)\\s*\\x60{3}");
  const match = text.match(jsonBlockRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  // fallback: return entire text if no code block found
  return text;
}

export async function getGeminiKeys(ctx: ActionCtx) {
  // @ts-ignore
  const keys = await ctx.runMutation(internal.geminiMutations.getActiveKeys) as Doc<"geminiApiKeys">[];
  
  const allKeys: Array<{ apiKey: string; keyId?: Id<"geminiApiKeys">; label?: string }> = [...keys];
  
  if (process.env.GEMINI_API_KEY) {
    allKeys.push({ apiKey: process.env.GEMINI_API_KEY, label: "Env Key" });
  }
  
  if (process.env.GOOGLE_API_KEY) {
    allKeys.push({ apiKey: process.env.GOOGLE_API_KEY, label: "Env Key (Google)" });
  }

  if (allKeys.length === 0) {
    throw new Error("No available Gemini API keys. Please add keys in Admin panel.");
  }
  
  return allKeys;
}

export async function generateWithGemini(
  ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  config: {
    jsonMode?: boolean;
    model?: string;
    useGemma?: boolean;
  } = {}
) {
  const allKeys = await getGeminiKeys(ctx);
  
  let lastError: any;
  let success = false;
  let generatedText = "";
  let usedModel = "";

  // Determine which models to try
  const modelsToAttempt = config.useGemma ? [gemmaModel] : (config.model ? [config.model] : modelsToTry);

  // Try models sequentially
  for (const modelName of modelsToAttempt) {
    // For each model, try all available keys
    for (const key of allKeys) {
      const genAI = new GoogleGenerativeAI(key.apiKey);
      
      try {
        const isJsonMode = config.jsonMode;
        const supportsJson = modelName.includes("1.5") || modelName.includes("2.0") || modelName.includes("2.5") || modelName.includes("3") || modelName.includes("flash");
        
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: (isJsonMode && supportsJson) ? { responseMimeType: "application/json" } : undefined
        });

        console.log(`Attempting to generate content with model: ${modelName} using key: ${key.label || "..."}`);
        const result = await model.generateContent([systemPrompt, userPrompt]);
        const response = result.response;
        generatedText = response.text();

        // Increment usage if we used a DB key
        if (key.keyId) {
          // @ts-ignore
          await ctx.runMutation(internal.geminiMutations.incrementUsage, { keyId: key.keyId });
        }

        success = true;
        usedModel = modelName;
        console.log(`Successfully generated content with model: ${modelName}`);
        break; // Exit key loop on success
      } catch (error) {
        console.warn(`Model ${modelName} failed with key ${key.label || "..."}:`, error);
        lastError = error;
        // Continue to next key
      }
    }
    
    if (success) break; // Exit model loop on success
  }

  if (!success) {
    console.error("All Gemini API keys and models failed.");
    throw lastError || new Error("Failed to generate AI content with any available key or model");
  }

  return { text: generatedText, model: usedModel };
}

// Vision-capable models (support image input)
const visionModels = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.5-flash-lite",
];

/**
 * Generate content with Gemini using an image URL (vision capability).
 * Downloads the image and passes it as inline data to Gemini.
 */
export async function generateWithGeminiVision(
  ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  imageUrl: string,
  config: { jsonMode?: boolean } = {}
) {
  const allKeys = await getGeminiKeys(ctx);

  let lastError: any;
  let success = false;
  let generatedText = "";
  let usedModel = "";

  // Download the image
  let imageData: { data: string; mimeType: string } | null = null;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const mimeType = contentType.split(";")[0].trim();
      imageData = { data: base64, mimeType };
    }
  } catch (e) {
    console.warn("Failed to download image for vision:", e);
  }

  if (!imageData) {
    // Fall back to text-only if image download fails
    return generateWithGemini(ctx, systemPrompt, userPrompt, config);
  }

  for (const modelName of visionModels) {
    for (const key of allKeys) {
      const genAI = new GoogleGenerativeAI(key.apiKey);
      try {
        const isJsonMode = config.jsonMode;
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: isJsonMode ? { responseMimeType: "application/json" } : undefined,
        });

        const result = await model.generateContent([
          systemPrompt,
          {
            inlineData: {
              data: imageData.data,
              mimeType: imageData.mimeType,
            },
          },
          userPrompt,
        ]);

        generatedText = result.response.text();

        if (key.keyId) {
          // @ts-ignore
          await ctx.runMutation(internal.geminiMutations.incrementUsage, { keyId: key.keyId });
        }

        success = true;
        usedModel = modelName;
        break;
      } catch (error) {
        console.warn(`Vision model ${modelName} failed:`, error);
        lastError = error;
      }
    }
    if (success) break;
  }

  if (!success) {
    throw lastError || new Error("Failed to generate vision content");
  }

  return { text: generatedText, model: usedModel };
}