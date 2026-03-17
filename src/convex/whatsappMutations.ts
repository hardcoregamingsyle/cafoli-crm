import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { LOG_CATEGORIES } from "./activityLogs";
import { restoreLeadFromR2Core } from "./r2_cache_prototype";
import { Id } from "./_generated/dataModel";

/**
 * Normalize a phone number for storage/matching.
 * WhatsApp always sends full international format (e.g. 919876543210).
 * We store as-is (full international). For matching we also try the 10-digit
 * local version (strip leading country code) for India (91) and other common codes.
 */
function standardizePhoneNumber(phone: string): string {
  if (!phone) return "";
  // Strip all non-digits
  const cleaned = phone.replace(/\D/g, "");
  // Return as-is — WhatsApp already sends full international format
  return cleaned;
}

/**
 * Build all candidate phone formats to try when matching a lead.
 * Handles India (91), and generic stripping of 1-3 digit country codes.
 */
function buildPhoneVariants(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, "");
  const variants = new Set<string>();
  variants.add(phone);          // original
  variants.add(cleaned);        // digits only

  // If 12-digit starting with 91 (India) → also try 10-digit
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    variants.add(cleaned.slice(2));
  }
  // If 11-digit starting with 1 (US/Canada) → also try 10-digit
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    variants.add(cleaned.slice(1));
  }
  // If 10-digit → also try with 91 prefix (India)
  if (cleaned.length === 10) {
    variants.add("91" + cleaned);
  }
  // Generic: try stripping 1, 2, or 3 digit country codes for longer numbers
  if (cleaned.length > 11) {
    variants.add(cleaned.slice(1));
    variants.add(cleaned.slice(2));
    variants.add(cleaned.slice(3));
  }

  return Array.from(variants).filter(v => v.length >= 7);
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
    templateName: v.optional(v.string()),
    templateButtons: v.optional(v.array(v.object({
      type: v.string(),
      text: v.string(),
      url: v.optional(v.string()),
      phoneNumber: v.optional(v.string()),
    }))),
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
      templateName: args.templateName,
      templateButtons: args.templateButtons,
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

    // Validate phone number
    if (!standardizedPhone || standardizedPhone.length < 7) {
      console.warn(`Skipping WhatsApp lead with invalid phone: "${args.phoneNumber}"`);
      return { leadId: null as any, isNewLead: false };
    }

    // Try all phone variants to find existing lead
    const variants = buildPhoneVariants(standardizedPhone);
    let existingLead = null;

    for (const variant of variants) {
      existingLead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", variant))
        .first();
      if (existingLead) break;
    }

    if (!existingLead) {
      // Check R2 for all variants
      for (const variant of variants) {
        const r2Lead = await ctx.db
          .query("r2_leads_mock")
          .withIndex("by_mobile", (q) => q.eq("mobile", variant))
          .first();
        if (r2Lead) {
          const restoredLeadId = await restoreLeadFromR2Core(ctx, r2Lead._id);
          if (restoredLeadId) {
            existingLead = await ctx.db.get(restoredLeadId as Id<"leads">);
          }
          break;
        }
      }
    }

    if (existingLead) {
      // Update lead name if we now have a real WhatsApp name and the current name is just a phone number
      if (args.name && args.name !== args.phoneNumber && args.name !== standardizedPhone) {
        const currentName = existingLead.name || "";
        const isNameJustPhone = /^\d+$/.test(currentName.replace(/\s/g, ""));
        if (isNameJustPhone || currentName === args.phoneNumber || currentName === standardizedPhone) {
          await ctx.db.patch(existingLead._id, { name: args.name });
        }
      }
      // If this was a bulk campaign lead awaiting assignment, clear that flag since they replied
      if (existingLead.adminAssignmentRequired) {
        await ctx.db.patch(existingLead._id, {
          adminAssignmentRequired: false,
          lastActivity: Date.now(),
        });
      }
      // Also try to mark bulk contact as replied if not already done
      await markBulkContactReplied(ctx, standardizedPhone, args.phoneNumber);
      return { leadId: existingLead._id, isNewLead: false };
    }

    // Check if it's a bulk contact reply - try all phone formats
    const contact = await findBulkContact(ctx, standardizedPhone, args.phoneNumber);

    if (contact) {
      // Mark bulk contact as replied
      await ctx.db.patch(contact._id, {
        status: "replied",
        lastInteractionAt: Date.now(),
      });

      // Create lead from bulk contact reply - NOT adminAssignmentRequired since they replied
      const leadId = await ctx.db.insert("leads", {
        name: args.name || contact.name || `Bulk Contact ${standardizedPhone}`,
        mobile: standardizedPhone,
        source: "Bulk Campaign Reply",
        status: "Cold",
        type: "To be Decided",
        lastActivity: Date.now(),
        message: args.message,
        priorityScore: 50,
        adminAssignmentRequired: false,
      });

      // Log lead creation
      await ctx.scheduler.runAfter(0, internal.activityLogs.logActivity, {
        category: LOG_CATEGORIES.LEAD_INCOMING,
        action: "Created new lead from Bulk Campaign Reply",
        leadId: leadId,
        details: `Phone: ${args.phoneNumber}, Bulk Contact: ${contact.name || "Unknown"}`,
      });

      return { leadId, isNewLead: true };
    }

    // Create new lead from WhatsApp
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

// Helper: find bulk contact by trying all phone number formats
async function findBulkContact(ctx: any, standardizedPhone: string, originalPhone: string) {
  const variants = buildPhoneVariants(standardizedPhone);
  // Also add original
  if (!variants.includes(originalPhone)) variants.push(originalPhone);

  for (const variant of variants) {
    const contact = await ctx.db
      .query("bulkContacts")
      .withIndex("by_phoneNumber", (q: any) => q.eq("phoneNumber", variant))
      .first();
    if (contact) return contact;
  }
  return null;
}

// Helper: mark bulk contact as replied when existing lead found
async function markBulkContactReplied(ctx: any, standardizedPhone: string, originalPhone: string) {
  const contact = await findBulkContact(ctx, standardizedPhone, originalPhone);
  if (contact && contact.status === "sent") {
    await ctx.db.patch(contact._id, {
      status: "replied",
      lastInteractionAt: Date.now(),
    });
  }
}

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

/**
 * Returns the set of externalIds already stored for a lead's chat,
 * used by syncMessages to avoid inserting duplicates.
 */
export const getExistingExternalIds = internalQuery({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args): Promise<string[]> => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .take(500);

    return messages
      .map((m) => m.externalId)
      .filter((id): id is string => !!id);
  },
});