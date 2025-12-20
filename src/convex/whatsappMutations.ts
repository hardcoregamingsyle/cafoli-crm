import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

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
    quotedMessageId: v.optional(v.id("messages")),
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
        unreadCount: args.direction === "inbound" ? 1 : 0,
      });
      chat = await ctx.db.get(chatId);
    } else {
      const updates: any = {
        lastMessageAt: Date.now(),
      };
      
      if (args.direction === "inbound") {
        updates.unreadCount = (chat.unreadCount || 0) + 1;
      }
      
      await ctx.db.patch(chat._id, updates);
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
      externalId: args.externalId,
      quotedMessageId: args.quotedMessageId,
    });
  },
});

export const markChatAsRead = mutation({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (chat) {
      await ctx.db.patch(chat._id, {
        unreadCount: 0,
      });
    }
  },
});

// Update message status based on webhook events
export const updateMessageStatus = internalMutation({
  args: {
    externalId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    // Find message by external ID
    const messages = await ctx.db.query("messages").collect();
    const message = messages.find(m => m.externalId === args.externalId);
    
    if (message) {
      await ctx.db.patch(message._id, {
        status: args.status,
      });
      console.log(`Updated message ${args.externalId} status to ${args.status}`);
    } else {
      console.log(`Message not found for external ID: ${args.externalId}`);
    }
  },
});

// Helper query for lead matching
export const getLeadsForMatching = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("leads").collect();
  },
});

// Send welcome template to new lead
export const sendWelcomeTemplate = internalMutation({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Schedule the action to send the template
      await ctx.scheduler.runAfter(0, api.whatsappTemplates.sendTemplateMessage, {
        phoneNumber: args.phoneNumber,
        templateName: "cafoliwelcomemessage",
        languageCode: "en_US",
        leadId: args.leadId,
      });
      console.log(`Scheduled welcome template for lead ${args.leadId}`);
    } catch (error) {
      console.error("Failed to schedule welcome template:", error);
    }
  },
});