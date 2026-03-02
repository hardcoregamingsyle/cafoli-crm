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
    const contact = await ctx.db
      .query("bulkContacts")
      .withIndex("by_phoneNumber", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    if (contact && contact.status === "sent") {
      await ctx.db.patch(contact._id, {
        status: "replied",
        lastInteractionAt: Date.now(),
      });

      const existingLead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", args.phoneNumber))
        .first();

      if (!existingLead) {
        const leadId = await ctx.db.insert("leads", {
          name: contact.name || "Bulk Contact",
          mobile: contact.phoneNumber,
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

        await ctx.db.insert("coldCallerLeads", {
          name: contact.name || "Cold Bulk Contact",
          mobile: contact.phoneNumber,
          source: "Expired Bulk Campaign",
          status: "Cold",
          lastActivity: Date.now(),
          originalContactId: contact._id,
        });
      }
    }
  },
});