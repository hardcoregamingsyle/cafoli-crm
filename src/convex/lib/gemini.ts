"use node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";

export const modelsToTry = [
  "gemini-2.0-flash",
  "gemini-3-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro"
];

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
  } = {}
) {
  const allKeys = await getGeminiKeys(ctx);
  
  let lastError: any;
  let success = false;
  let generatedText = "";
  let usedModel = "";

  // Try models sequentially
  for (const modelName of modelsToTry) {
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