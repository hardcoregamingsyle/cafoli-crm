import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const storeMessage = internalMutation({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
    content: v.string(),
    direction: v.string(),
    status: v.string(),
    externalId: v.string(),
    messageType: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaName: v.optional(v.string()),
    mediaMimeType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find or create chat
    let chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) {
      const chatId = await ctx.db.insert("chats", {
        leadId: args.leadId,
        platform: "whatsapp",
        externalId: args.phoneNumber,
        lastMessageAt: Date.now(),
      });
      chat = await ctx.db.get(chatId);
    } else {
      await ctx.db.patch(chat._id, {
        lastMessageAt: Date.now(),
      });
    }

    if (!chat) throw new Error("Failed to create chat");

    // Store message
    await ctx.db.insert("messages", {
      chatId: chat._id,
      direction: args.direction,
      content: args.content,
      status: args.status,
      messageType: args.messageType,
      mediaUrl: args.mediaUrl,
      mediaName: args.mediaName,
      mediaMimeType: args.mediaMimeType,
    });
  },
});

// Helper query for lead matching
export const getLeadsForMatching = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("leads").collect();
  },
});