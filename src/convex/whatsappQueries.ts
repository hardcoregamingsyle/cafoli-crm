import { query } from "./_generated/server";
import { v } from "convex/values";

export const getChatMessages = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    // Find the chat for this lead
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) {
      return [];
    }

    // Get all messages for this chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("asc")
      .collect();

    return messages;
  },
});