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