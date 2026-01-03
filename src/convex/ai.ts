"use node";
import { action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

export const generateContent = action({
  args: {
    prompt: v.string(),
    type: v.string(), // "chat_reply", "lead_analysis", "follow_up_suggestion"
    context: v.optional(v.any()), // Additional context like lead details, chat history
    userId: v.id("users"),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    // @ts-ignore
    const keys = await ctx.runMutation(internal.geminiMutations.getActiveKeys) as Doc<"geminiApiKeys">[];
    
    // Combine DB keys with env var key if available
    const allKeys: Array<{ apiKey: string; keyId?: Id<"geminiApiKeys">; label?: string }> = [...keys];
    
    if (process.env.GEMINI_API_KEY) {
      allKeys.push({ apiKey: process.env.GEMINI_API_KEY, label: "Env Key" });
    }

    if (allKeys.length === 0) {
      throw new Error("No available Gemini API keys. Please add keys in Admin panel.");
    }

    let lastError: any;
    let success = false;
    let generatedText = "";

    // Try keys sequentially until one works
    for (const key of allKeys) {
      try {
        const genAI = new GoogleGenerativeAI(key.apiKey);
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

        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        generatedText = response.text();

        // Increment usage if we used a DB key
        if (key.keyId) {
          // @ts-ignore
          await ctx.runMutation(internal.geminiMutations.incrementUsage, { keyId: key.keyId });
        }

        success = true;
        break; // Exit loop on success
      } catch (error) {
        console.warn(`Gemini API key ${key.label || key.apiKey.substring(0, 5)}... failed:`, error);
        lastError = error;
        // Continue to next key
      }
    }

    if (!success) {
      console.error("All Gemini API keys failed.");
      throw lastError || new Error("Failed to generate AI content with any available key");
    }

    // Log the generation
    await ctx.runMutation(internal.aiMutations.logAiGeneration, {
      userId: args.userId,
      leadId: args.leadId,
      type: args.type,
      content: generatedText,
      status: "generated",
    });

    return generatedText;
  },
});