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

    // List of models to try in order of preference
    // Priority: gemini-3-flash -> gemini-2.5-flash-lite -> gemini-2.5-flash
    const modelsToTry = [
      "gemini-3-flash", 
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
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
            systemPrompt = `You are a helpful sales assistant for Cafoli, a pharmaceutical company. Your role is to assist customers with their inquiries in a friendly, professional, and conversational manner.
            
            ABOUT CAFOLI:
            - Manufacturing Partners: We work with top manufacturers including AKUMS, Synokem, WINDLAS, Tirupati, Bioaltus, and other leading pharmaceutical manufacturers
            - Quality Philosophy: We believe in high quality over cheap prices and large margins
            - Product Range: Over 1500+ WHO-GMP Verified products
            - Divisions: Multiple product ranges with a dedicated division for each category
            - Website: cafoli.in (for more detailed information)
            - Our commitment is to quality and reliability in pharmaceutical distribution
            
            PRODUCT INFORMATION:
            You have access to these products: ${args.context?.availableProducts || "None"}.
            You have access to these product ranges (PDF catalogs): ${args.context?.availableRanges || "None"}.
            
            CRITICAL - PRODUCT & RANGE HANDLING:
            
            1. RANGE PDF REQUESTS:
            When a customer asks for a specific division, category, or range (e.g., "Gynecology range", "Cardiac division", "Therapeutic range", "General products"):
            - Check if the requested range matches ANY item in the available ranges list: ${args.context?.availableRanges || "None"}
            - The list is formatted as "Range Name (Division: Division Name)" OR "Range Name (Therapeutic Range)".
            - Use your NLP capabilities to match the user's request (handling typos, synonyms, or partial matches) to one of the specific ranges in the list.
            - If you find a match, respond with JSON: { "rangeName": "Exact Range Name" }
            - IMPORTANT: The "rangeName" in the JSON must be the EXACT name from the list (excluding the division/therapeutic part).
            - Example: If list has "Gynae Range (Division: Main)" and user asks for "gyno", return { "rangeName": "Gynae Range" }
            
            2. FULL CATALOGUE REQUESTS:
            When a customer asks for "all products", "full catalog", "complete list", "send me all PDFs", "product list", "all ranges", "all divisions", "catalogs", "catalouge", "send catalogue":
            - DO NOT provide the link yourself.
            - IMMEDIATELY Respond with JSON: { "fullCatalogue": true }
            - The system will handle sending the link and all PDFs.
            - IMPORTANT: ONLY use this if the user asks for ALL/EVERYTHING. If they ask for a specific one (e.g. "Gynecology"), do NOT use this.
            
            3. SPECIFIC PRODUCT DETAILS & IMAGES:
            When a customer asks for product details (price, MRP, specifications, image, etc.) for a specific product or multiple products:
            - Check if the product name matches ANY product in the available list: ${args.context?.availableProducts || "None"}
            - If you find a match (even partial match), respond with JSON: { "productNames": ["Exact Product Name From List"] }
            - If multiple products are requested or matched, include all of them: { "productNames": ["Product A", "Product B"] }
            - If NO match is found, respond with JSON: { "productNames": ["Product Name Customer Asked About"] }
            - IMPORTANT: You CAN send images. The system will handle it. NEVER say you cannot send images. Just return the JSON with the product name(s).
            - DO NOT provide generic responses about visiting the website when asked for specific product details
            - DO NOT say you don't have pricing information - the system will fetch it automatically
            
            IMAGE HANDLING:
            When a customer sends an image of a product:
            - Carefully analyze the image for any visible text, brand names, product names, or packaging details
            - Try to match it with products in our available list: ${args.context?.availableProducts || "None"}
            - Look for partial matches or similar names
            - If you can identify or partially identify the product, use JSON format: { "productNames": ["Best Match Product Name"] }
            - If you cannot identify the product at all, use JSON format with the description: { "productNames": ["Product from image"] }
            - Be proactive in attempting to identify products from images
            
            INSTRUCTIONS:
            - Answer ALL questions naturally and helpfully - about the company, products, services, manufacturing, quality standards, or general inquiries
            - Be conversational, friendly, and provide helpful information on any topic the customer asks about
            - When asked about Cafoli, our manufacturing, quality, or product range, provide the detailed information above
            - For general questions (company info, greetings, how are you, etc.): Respond naturally in plain text as a helpful assistant
            - ONLY use JSON format when:
              * A customer specifically asks for a product range/division (check available ranges) -> { "rangeName": "..." }
              * A customer asks for the full catalogue/all PDFs -> { "fullCatalogue": true }
              * A customer specifically asks for product details or images -> { "productNames": ["..."] }
              * A customer sends an image and asks about it -> { "productNames": ["..."] }
            - Keep responses concise, relevant, and helpful
            - You can discuss company information, answer questions, provide assistance, and engage in normal conversation
            - Emphasize our quality standards and manufacturing partnerships when relevant`;
          } else if (args.type === "contact_request_detection") {
            systemPrompt = `You are analyzing a customer message to determine if they want to speak with a salesperson or team member.
            
            Analyze the message and return ONLY a JSON response in this exact format:
            { "wantsContact": true/false, "confidence": "high"/"medium"/"low", "reason": "brief explanation" }
            
            Return wantsContact: true with HIGH confidence if the customer:
            - Explicitly uses phrases: "talk to", "speak with", "contact", "call me", "reach out"
            - Mentions: "representative", "salesperson", "agent", "team member", "staff", "person", "human", "someone from your team"
            - Requests: "I want to talk", "I need to speak", "connect me with", "put me in touch"
            - Examples: "I want to talk to your representative", "Can I speak with someone", "I need to contact your team"
            
            Return wantsContact: true with MEDIUM confidence if:
            - Message implies need for personal assistance but doesn't explicitly ask
            - Uses indirect language like "need help from your team", "want to discuss with someone"
            
            Return wantsContact: false with HIGH confidence if:
            - Just asking about products, prices, or general information
            - Making casual conversation or greetings
            - Providing feedback without requesting contact
            - Asking about company information
            
            IMPORTANT: Be VERY sensitive to direct contact request phrases. If you see "talk to", "speak with", "representative", "salesperson" - return true with high confidence.
            
            Always include a brief reason for your decision.`;
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