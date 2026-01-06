"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { generateWithGemini } from "./lib/gemini";

export const generate = action({
  args: {
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const systemPrompt = args.systemPrompt || "You are a helpful assistant.";
    const { text } = await generateWithGemini(ctx, systemPrompt, args.prompt);
    return text;
  },
});

export const generateJson = action({
  args: {
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const systemPrompt = args.systemPrompt || "You are a helpful assistant that outputs JSON.";
    const { text } = await generateWithGemini(ctx, systemPrompt, args.prompt, { jsonMode: true });
    return text;
  },
});

export const analyzeLeadComprehensive = action({
  args: {
    leadData: v.any(),
    comments: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const systemPrompt = `You are an expert CRM analyst specializing in pharmaceutical sales and lead qualification. 
    Provide a comprehensive, structured analysis of the lead with actionable insights.
    
    Your analysis should include:
    1. **Lead Quality Score** (1-10): Rate the lead's potential value
    2. **Key Strengths**: What makes this lead promising
    3. **Concerns/Red Flags**: Any issues or risks to address
    4. **Engagement Level**: How engaged is this lead based on their activity
    5. **Recommended Actions**: Specific next steps to move this lead forward
    6. **Product Recommendations**: Which products/services might interest them
    7. **Communication Strategy**: Best approach for follow-up
    8. **Timeline Suggestion**: When to follow up and why
    
    Be specific, actionable, and concise. Use bullet points for clarity.`;

    const leadInfo = {
      name: args.leadData.name,
      company: args.leadData.company,
      mobile: args.leadData.mobile,
      email: args.leadData.email,
      status: args.leadData.status,
      type: args.leadData.type,
      source: args.leadData.source,
      subject: args.leadData.subject,
      message: args.leadData.message,
      city: args.leadData.city,
      state: args.leadData.state,
      country: args.leadData.country,
      nextFollowUpDate: args.leadData.nextFollowUpDate,
      lastContactedAt: args.leadData.lastContactedAt,
      assignedTo: args.leadData.assignedTo,
      tags: args.leadData.tags,
      comments: args.comments || [],
    };

    const prompt = `Analyze this pharmaceutical lead comprehensively:\n\n${JSON.stringify(leadInfo, null, 2)}`;

    const { text } = await generateWithGemini(ctx, systemPrompt, prompt);
    return text;
  },
});