import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { LOG_CATEGORIES } from "./activityLogs";
import { restoreLeadFromR2Core } from "./r2_cache_prototype";
import { Id } from "./_generated/dataModel";

function standardizePhoneNumber(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return "91" + cleaned;
  }
  return cleaned;
}

export const storeMessage = internalMutation({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
    content: v.string(),
    direction: v.string(),
    status: v.string(),
    externalId: v.optional(v.string()),
    messageType: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaName: v.optional(v.string()),
    mediaMimeType: v.optional(v.string()),
    quotedMessageId: v.optional(v.id("messages")),
    quotedMessageExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) {
      // Create new chat if it doesn't exist
      const chatId = await ctx.db.insert("chats", {
        leadId: args.leadId,
        unreadCount: 0,
        lastMessageAt: Date.now(),
        platform: "whatsapp",
      });
      chat = await ctx.db.get(chatId);
      console.log(`Created WhatsApp chat for lead ${args.leadId} inside storeMessage`);
    }

    if (!chat) {
      throw new Error("Failed to find or create chat for this lead");
    }

    // Update chat metadata (timestamp and unread count)
    const updateFields: any = {
      lastMessageAt: Date.now(),
    };
    
    if (args.direction === "inbound") {
      updateFields.unreadCount = (chat.unreadCount || 0) + 1;
    }
    
    await ctx.db.patch(chat._id, updateFields);

    let quotedMessageId = args.quotedMessageId;

    // If we have an external ID for the quoted message but no internal ID, try to find it
    if (!quotedMessageId && args.quotedMessageExternalId) {
      const quotedMessage = await ctx.db
        .query("messages")
        .withIndex("by_external_id", (q) => q.eq("externalId", args.quotedMessageExternalId!))
        .first();
      
      if (quotedMessage) {
        quotedMessageId = quotedMessage._id;
      }
    }

    const messageId = await ctx.db.insert("messages", {
      chatId: chat._id,
      direction: args.direction,
      content: args.content,
      status: args.status,
      messageType: args.messageType || "text",
      mediaUrl: args.mediaUrl,
      mediaName: args.mediaName,
      mediaMimeType: args.mediaMimeType,
      externalId: args.externalId,
      quotedMessageId: quotedMessageId,
    });

    // Update lead's lastActivity to ensure it moves to the top of the list
    await ctx.db.patch(args.leadId, {
      lastActivity: Date.now(),
    });

    // Send Push Notification for inbound messages
    if (args.direction === "inbound") {
      const lead = await ctx.db.get(args.leadId);
      if (lead && lead.assignedTo) {
        // Use try-catch to prevent failure if push notification fails or action is not found yet
        try {
          // Cast internal to any to avoid type errors while api types are regenerating
          await ctx.scheduler.runAfter(0, (internal as any).pushNotificationsActions.sendPushNotification, {
            userId: lead.assignedTo,
            title: `New Message from ${lead.name}`,
            body: args.content.substring(0, 50) + (args.content.length > 50 ? "..." : ""),
            url: `/whatsapp?leadId=${lead._id}`,
          });
        } catch (e) {
          console.error("Failed to schedule push notification:", e);
        }
      }
    }

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

export const processWhatsAppLead = internalMutation({
  args: {
    phoneNumber: v.string(),
    name: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const standardizedPhone = standardizePhoneNumber(args.phoneNumber);
    
    // Try exact match on standardized phone
    let existingLead = await ctx.db
      .query("leads")
      .withIndex("by_mobile", (q) => q.eq("mobile", standardizedPhone))
      .first();
      
    if (!existingLead) {
      // Fallback to exact match on original phone
      existingLead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", args.phoneNumber))
        .first();
    }

    if (!existingLead) {
      // Check R2 for standardized phone
      let r2Lead = await ctx.db
        .query("r2_leads_mock")
        .withIndex("by_mobile", (q) => q.eq("mobile", standardizedPhone))
        .first();
        
      if (!r2Lead) {
        r2Lead = await ctx.db
          .query("r2_leads_mock")
          .withIndex("by_mobile", (q) => q.eq("mobile", args.phoneNumber))
          .first();
      }
      
      if (r2Lead) {
        const restoredLeadId = await restoreLeadFromR2Core(ctx, r2Lead._id);
        if (restoredLeadId) {
          existingLead = await ctx.db.get(restoredLeadId as Id<"leads">);
        }
      }
    }

    if (existingLead) {
      return { leadId: existingLead._id, isNewLead: false };
    }

    // Check if it's a bulk contact reply
    const contact = await ctx.db
      .query("bulkContacts")
      .withIndex("by_phoneNumber", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (contact && contact.status === "sent") {
      await ctx.db.patch(contact._id, {
        status: "replied",
        lastInteractionAt: Date.now(),
      });

      const leadId = await ctx.db.insert("leads", {
        name: contact.name || "Bulk Contact",
        mobile: standardizedPhone,
        source: "Bulk Campaign Reply",
        status: "Cold",
        type: "To be Decided",
        lastActivity: Date.now(),
        message: args.message,
        priorityScore: 50,
      });
      return { leadId, isNewLead: true };
    }

    // Create new lead
    const leadId = await ctx.db.insert("leads", {
      name: args.name || args.phoneNumber,
      subject: "New WhatsApp Lead",
      source: "WhatsApp",
      mobile: standardizedPhone,
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

    return { leadId, isNewLead: true };
  }
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
        unreadCount: 1,
        lastMessageAt: Date.now(),
        platform: "whatsapp",
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
    const standardizedPhone = standardizePhoneNumber(args.phoneNumber);
    const leadId = await ctx.db.insert("leads", {
      name: args.name || args.phoneNumber,
      subject: "New WhatsApp Lead",
      source: "WhatsApp",
      mobile: standardizedPhone,
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