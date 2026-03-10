import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

export const getBulkContacts = query({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bulkContacts")
      .withIndex("by_sentAt")
      .order("desc")
      .take(100);
  },
});

export const trackSentMessages = mutation({
  args: {
    adminId: v.id("users"),
    contacts: v.array(v.object({
      phoneNumber: v.string(),
      name: v.optional(v.string()),
      templateId: v.string(),
      metadata: v.optional(v.any()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const contact of args.contacts) {
      await ctx.db.insert("bulkContacts", {
        ...contact,
        adminId: args.adminId,
        status: "sent",
        sentAt: now,
      });
    }
  },
});

export const insertBulkContact = internalMutation({
  args: {
    adminId: v.id("users"),
    phoneNumber: v.string(),
    name: v.optional(v.string()),
    templateId: v.string(),
    externalMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("bulkContacts", {
      adminId: args.adminId,
      phoneNumber: args.phoneNumber,
      name: args.name,
      templateId: args.templateId,
      status: "sent",
      sentAt: Date.now(),
    });
  },
});

export const processReply = internalMutation({
  args: { phoneNumber: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const cleaned = args.phoneNumber.replace(/\D/g, "");
    const tenDigit = cleaned.startsWith("91") && cleaned.length === 12 ? cleaned.slice(2) : cleaned;
    const twelveDigit = cleaned.length === 10 ? "91" + cleaned : cleaned;

    // Try all formats to find the bulk contact
    let contact = await ctx.db
      .query("bulkContacts")
      .withIndex("by_phoneNumber", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (!contact) {
      contact = await ctx.db
        .query("bulkContacts")
        .withIndex("by_phoneNumber", (q) => q.eq("phoneNumber", twelveDigit))
        .first();
    }

    if (!contact) {
      contact = await ctx.db
        .query("bulkContacts")
        .withIndex("by_phoneNumber", (q) => q.eq("phoneNumber", tenDigit))
        .first();
    }

    if (contact && contact.status === "sent") {
      await ctx.db.patch(contact._id, {
        status: "replied",
        lastInteractionAt: Date.now(),
      });

      const existingLead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", twelveDigit))
        .first();

      if (!existingLead) {
        const leadId = await ctx.db.insert("leads", {
          name: contact.name || "Bulk Contact",
          mobile: twelveDigit,
          source: "Bulk Campaign Reply",
          status: "Cold",
          type: "To be Decided",
          lastActivity: Date.now(),
          message: args.message,
          priorityScore: 50,
        });
        return leadId;
      }
      return existingLead._id;
    }
    return null;
  },
});

export const cleanupOldContacts = internalMutation({
  handler: async (ctx) => {
    const hundredDaysAgo = Date.now() - (100 * 24 * 60 * 60 * 1000);

    const oldContacts = await ctx.db
      .query("bulkContacts")
      .withIndex("by_sentAt", (q) => q.lt("sentAt", hundredDaysAgo))
      .take(50);

    for (const contact of oldContacts) {
      if (contact.status === "sent") {
        await ctx.db.patch(contact._id, { status: "cold" });

        // Check if a lead already exists for this phone number
        const cleaned = contact.phoneNumber.replace(/\D/g, "");
        const twelveDigit = cleaned.length === 10 ? "91" + cleaned : cleaned;
        
        const existingLead = await ctx.db
          .query("leads")
          .withIndex("by_mobile", (q) => q.eq("mobile", twelveDigit))
          .first();

        if (!existingLead) {
          // Create as a cold caller lead directly in the leads table
          await ctx.db.insert("leads", {
            name: contact.name || `Cold Bulk Contact ${contact.phoneNumber}`,
            mobile: twelveDigit,
            source: "Expired Bulk Campaign",
            status: "Cold",
            type: "To be Decided",
            lastActivity: Date.now(),
            isColdCallerLead: true,
            adminAssignmentRequired: false,
          });
        } else if (!existingLead.isColdCallerLead) {
          // Mark existing lead as cold caller lead
          await ctx.db.patch(existingLead._id, {
            isColdCallerLead: true,
          });
        }
      }
    }
  },
});

export const initBatch = internalMutation({
  args: { processId: v.string(), total: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.insert("batchProcessControl", {
      processId: args.processId,
      processed: 0,
      failed: 0,
      total: args.total,
      status: "processing",
      updatedAt: Date.now(),
    });
  }
});

export const updateBatchProgress = internalMutation({
  args: { processId: v.string(), processed: v.number(), failed: v.number(), isComplete: v.boolean() },
  handler: async (ctx, args) => {
    const batch = await ctx.db.query("batchProcessControl").withIndex("by_process_id", q => q.eq("processId", args.processId)).first();
    if (batch) {
      await ctx.db.patch(batch._id, {
        processed: (batch.processed || 0) + args.processed,
        failed: (batch.failed || 0) + args.failed,
        status: args.isComplete ? "completed" : "processing",
        updatedAt: Date.now(),
      });
    }
  }
});

export const getBatchStatus = query({
  args: { processId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("batchProcessControl").withIndex("by_process_id", q => q.eq("processId", args.processId)).first();
  }
});