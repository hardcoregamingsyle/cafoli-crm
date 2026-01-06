import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { LOG_CATEGORIES } from "./activityLogs";

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
    quotedMessageExternalId: v.optional(v.string()),
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

    // Resolve quoted message ID
    let quotedMessageId = args.quotedMessageId;
    if (!quotedMessageId && args.quotedMessageExternalId) {
      const quotedMsg = await ctx.db
        .query("messages")
        .withIndex("by_external_id", (q) => q.eq("externalId", args.quotedMessageExternalId))
        .first();
      
      if (quotedMsg) {
        quotedMessageId = quotedMsg._id;
      }
    }

    // Store message
    const messageId = await ctx.db.insert("messages", {
      chatId: chat._id,
      direction: args.direction,
      content: args.content,
      status: args.status,
      messageType: args.messageType,
      mediaUrl: args.mediaUrl,
      mediaName: args.mediaName,
      mediaMimeType: args.mediaMimeType,
      externalId: args.externalId,
      quotedMessageId: quotedMessageId,
    });

    // Log activity
    await ctx.scheduler.runAfter(0, internal.activityLogs.logActivity, {
      category: args.direction === "inbound" ? LOG_CATEGORIES.WHATSAPP_INCOMING : LOG_CATEGORIES.WHATSAPP_OUTGOING,
      action: args.direction === "inbound" ? "Received WhatsApp message" : "Sent WhatsApp message",
      details: args.content.substring(0, 100) + (args.content.length > 100 ? "..." : ""),
      leadId: args.leadId,
      metadata: {
        messageId: messageId,
        externalId: args.externalId,
        type: args.messageType,
        direction: args.direction,
      }
    });
  },
});

export const ensureChatExists = internalMutation({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if chat already exists
    let chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) {
      // Create new chat
      const chatId = await ctx.db.insert("chats", {
        leadId: args.leadId,
        platform: "whatsapp",
        externalId: args.phoneNumber,
        lastMessageAt: Date.now(),
        unreadCount: 0,
      });
      chat = await ctx.db.get(chatId);
      console.log(`Created WhatsApp chat for lead ${args.leadId}`);
    }

    return chat;
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
      // Reset unread count
      await ctx.db.patch(chat._id, {
        unreadCount: 0,
      });

      // Find unread inbound messages
      // We look for messages with status "received" which implies they haven't been read yet
      const unreadMessages = await ctx.db
        .query("messages")
        .withIndex("by_chat_status", (q) => q.eq("chatId", chat._id).eq("status", "received"))
        .collect();

      if (unreadMessages.length > 0) {
        const messageIds: string[] = [];
        
        for (const msg of unreadMessages) {
          // Update status in DB to "read"
          await ctx.db.patch(msg._id, { status: "read" });
          
          if (msg.externalId) {
            messageIds.push(msg.externalId);
          }
        }

        // Schedule action to mark as read on WhatsApp
        if (messageIds.length > 0) {
          await ctx.scheduler.runAfter(0, internal.whatsapp.messages.markMessagesAsRead, {
            messageIds,
          });
        }
      }
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
    // Find message by external ID using the index for efficiency and to avoid OCC conflicts
    const message = await ctx.db
      .query("messages")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .first();
    
    if (message) {
      await ctx.db.patch(message._id, {
        status: args.status,
      });
      console.log(`Updated message ${args.externalId} status to ${args.status}`);

      // Log status change
      const chat = await ctx.db.get(message.chatId);
      if (chat) {
        await ctx.scheduler.runAfter(0, internal.activityLogs.logActivity, {
            category: LOG_CATEGORIES.WHATSAPP_STATUS,
            action: `Message status updated: ${args.status}`,
            leadId: chat.leadId,
            details: `External ID: ${args.externalId}`,
        });
      }
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

export const createLeadFromWhatsApp = internalMutation({
  args: {
    phoneNumber: v.string(),
    name: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const leadId = await ctx.db.insert("leads", {
      name: args.name || args.phoneNumber,
      subject: "New WhatsApp Lead",
      source: "WhatsApp",
      mobile: args.phoneNumber,
      status: "Cold",
      type: "To be Decided",
      lastActivity: Date.now(),
      message: args.message,
    });

    // Log lead creation
    await ctx.scheduler.runAfter(0, internal.activityLogs.logActivity, {
      category: LOG_CATEGORIES.LEAD_INCOMING,
      action: "Created new lead from WhatsApp",
      leadId: leadId,
      details: `Phone: ${args.phoneNumber}`,
    });

    return leadId;
  },
});