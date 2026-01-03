"use node";
import { action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// Helper to get next available key
async function getNextApiKey(ctx: ActionCtx): Promise<{ key: string; keyId: Id<"geminiApiKeys"> } | null> {
  // @ts-ignore
  const internalAny: any = internal;
  // We use a mutation here to ensure we get fresh data and can potentially reset counters if needed, 
  // though typically we'd use a query. Reusing the pattern from Brevo.
  // However, since we need to check dates and potentially reset, we might need to do that logic here or in the mutation.
  // Let's fetch keys first.
  const keys = await ctx.runMutation(internalAny.geminiMutations.getActiveKeys) as Doc<"geminiApiKeys">[];

  if (!keys || keys.length === 0) {
    // Fallback to env var if no keys in DB (backward compatibility)
    if (process.env.GEMINI_API_KEY) {
       // We don't have an ID for the env var key, so we return a dummy one or handle it separately.
       // For simplicity, if DB keys exist, we use them. If not, we try env var.
       return null; 
    }
    return null;
  }

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Check for resets
  for (const key of keys) {
    if (now - key.lastResetAt > oneDayMs) {
      await ctx.runMutation(internalAny.geminiMutations.resetDailyUsageInternal, { keyId: key._id });
      key.usageCount = 0; // Update local copy
    }
  }

  // Find first available key
  for (const key of keys) {
    if (key.usageCount < (key.dailyLimit || 1000)) {
      return { key: key.apiKey, keyId: key._id };
    }
  }

  return null;
}

export const generateContent = action({
  args: {
    prompt: v.string(),
    type: v.string(), // "chat_reply", "lead_analysis", "follow_up_suggestion"
    context: v.optional(v.any()), // Additional context like lead details, chat history
    userId: v.id("users"),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    let apiKey = "";
    let keyId: Id<"geminiApiKeys"> | undefined;

    const keyData = await getNextApiKey(ctx);
    
    if (keyData) {
      apiKey = keyData.key;
      keyId = keyData.keyId;
    } else if (process.env.GEMINI_API_KEY) {
      apiKey = process.env.GEMINI_API_KEY;
    } else {
      throw new Error("No available Gemini API keys. Please add keys in Admin panel.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let systemPrompt = "";
    if (args.type === "chat_reply") {
      systemPrompt = "You are a helpful sales assistant. Draft a professional and friendly reply to the customer based on the context provided. Keep it concise and relevant to the conversation history.";
    } else if (args.type === "lead_analysis") {
      systemPrompt = "Analyze the following lead information and provide insights on lead quality, potential needs, and recommended next steps. Be brief and actionable.";
    } else if (args.type === "follow_up_suggestion") {
      systemPrompt = "Suggest a follow-up date (in days from now) and a message based on the last interaction. Return JSON format: { \"days\": number, \"message\": string }.";
    }

    const fullPrompt = `${systemPrompt}\n\nContext: ${JSON.stringify(args.context)}\n\nPrompt: ${args.prompt}`;

    try {
      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();

      // Increment usage if we used a DB key
      if (keyId) {
        // @ts-ignore
        await ctx.runMutation(internal.geminiMutations.incrementUsage, { keyId });
      }

      // Log the generation
      await ctx.runMutation(internal.aiMutations.logAiGeneration, {
        userId: args.userId,
        leadId: args.leadId,
        type: args.type,
        content: text,
        status: "generated",
      });

      return text;
    } catch (error) {
      console.error("AI Generation Error:", error);
      // If we have a keyId and it failed, maybe we should mark it? 
      // For now, just throw.
      throw new Error("Failed to generate AI content");
    }
  },
});