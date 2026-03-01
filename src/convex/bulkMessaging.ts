import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api, internal } from "./_generated/api";

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

export const processReply = mutation({
  args: { phoneNumber: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const contact = await ctx.db
      .query("bulkContacts")
      .withIndex("by_phoneNumber", (q) => q.eq("phoneNumber", args.phoneNumber))
      .filter((q) => q.eq(q.field("status"), "sent"))
      .first();

    if (contact) {
      // Update contact status
      await ctx.db.patch(contact._id, {
        status: "replied",
        lastInteractionAt: Date.now(),
      });

      // Check if lead already exists
      const existingLead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", args.phoneNumber))
        .first();

      if (!existingLead) {
        // Create new lead from bulk contact reply
        await ctx.db.insert("leads", {
          name: contact.name || "Bulk Contact",
          mobile: contact.phoneNumber,
          source: "Bulk Campaign Reply",
          status: "Cold",
          type: "To be Decided",
          lastActivity: Date.now(),
          message: args.message,
          priorityScore: 50, // Default mid-score for replies
        });
      }
    }
  },
});

export const cleanupOldContacts = mutation({
  handler: async (ctx) => {
    const hundredDaysAgo = Date.now() - (100 * 24 * 60 * 60 * 1000);
    
    const oldContacts = await ctx.db
      .query("bulkContacts")
      .withIndex("by_sentAt", (q) => q.lt("sentAt", hundredDaysAgo))
      .filter((q) => q.eq(q.field("status"), "sent"))
      .collect();

    for (const contact of oldContacts) {
      await ctx.db.patch(contact._id, { status: "cold" });
      
      // Add to Cold Caller Leads
      await ctx.db.insert("coldCallerLeads" as any, {
        name: contact.name || "Cold Bulk Contact",
        mobile: contact.phoneNumber,
        source: "Expired Bulk Campaign",
        status: "Cold",
        lastActivity: Date.now(),
        originalContactId: contact._id,
      });
    }
  },
});