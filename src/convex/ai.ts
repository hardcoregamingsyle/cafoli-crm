"use node";
import { action, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

export const generateContent = action({
  args: {
    prompt: v.string(),
    type: v.string(), // "chat_reply", "lead_analysis", "follow_up_suggestion", "campaign_email_content"
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

    // Check if we need to switch model for product queries
    let preferredModel = "gemini-3-flash"; // Default
    
    // Simple heuristic to detect product queries if not explicitly set
    const context = args.context || {};
    const isProductQuery = context.availableProducts && args.prompt.toLowerCase().includes("product") || args.prompt.toLowerCase().includes("price") || args.prompt.toLowerCase().includes("image");
    
    if (isProductQuery) {
        // User requested gemma-3-27b, but we'll map it to a high-reasoning model available in Gemini
        // or try to use it if the provider supports it. 
        // Since we are using GoogleGenerativeAI SDK, we stick to Gemini models.
        // We'll use gemini-1.5-pro as the "smart" model for this.
        preferredModel = "gemini-1.5-pro"; 
    }

    // List of models to try in order of preference as requested by user
    // We iterate through models first, then keys, to prioritize better models
    const modelsToTry = [
      preferredModel,
      "gemini-3-flash", 
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      // Fallbacks in case the above don't exist or are limited
      "gemini-2.0-flash-exp", 
      "gemini-1.5-flash", 
      "gemini-1.5-pro", 
      "gemini-pro"
    ];

    // Try models sequentially
    for (const modelName of modelsToTry) {
      // For each model, try all available keys
      for (const key of allKeys) {
        const genAI = new GoogleGenerativeAI(key.apiKey);
        
        try {
          // Use JSON mode for structured data requests if supported by the model
          // Gemini 1.0 (gemini-pro) does not support responseMimeType
          const isJsonMode = args.type === "follow_up_suggestion";
          const supportsJson = modelName.includes("1.5") || modelName.includes("2.0") || modelName.includes("2.5") || modelName.includes("3") || modelName.includes("flash");
          
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: (isJsonMode && supportsJson) ? { responseMimeType: "application/json" } : undefined
          });

          let systemPrompt = "";
          if (args.type === "chat_reply") {
            systemPrompt = `You are a helpful sales assistant. Draft a professional and friendly reply to the customer based on the context provided. 
            
            IMPORTANT: You have access to a list of products: ${context.availableProducts || "None"}.
            If the user is asking about a specific product, price, or image, and it matches one of the products in the list, you MUST return a JSON object in this format:
            { "productName": "Exact Product Name From List", "message": "Optional message to accompany the product details" }
            
            If the user is NOT asking about a specific product or the product is not in the list, just return the plain text reply string.
            
            Keep it concise and relevant to the conversation history.`;
          } else if (args.type === "lead_analysis") {
            systemPrompt = "Analyze the following lead information and provide insights on lead quality, potential needs, and recommended next steps. Be brief and actionable.";
          } else if (args.type === "follow_up_suggestion") {
            systemPrompt = "Suggest a follow-up date (in days from now) and a message based on the last interaction. Return JSON format: { \"days\": number, \"message\": string }.";
          } else if (args.type === "campaign_email_content") {
            systemPrompt = "You are an expert email marketing copywriter. Write a professional, engaging, and concise email body based on the provided subject and context. Do not include the subject line in the body. Use placeholders like {{Name}} if appropriate.";
          }

          const fullPrompt = `${systemPrompt}\n\nContext: ${JSON.stringify(args.context)}\n\nPrompt: ${args.prompt}`;

          console.log(`Attempting to generate content with model: ${modelName} using key: ${key.label || "..."}`);
          const result = await model.generateContent(fullPrompt);
          const response = result.response;
          generatedText = response.text();

          // Increment usage if we used a DB key
          if (key.keyId) {
            // @ts-ignore
            await ctx.runMutation(internal.geminiMutations.incrementUsage, { keyId: key.keyId });
          }

          success = true;
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