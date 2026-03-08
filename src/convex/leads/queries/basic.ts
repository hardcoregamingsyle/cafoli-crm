import { v } from "convex/values";
import { query, internalQuery } from "../../_generated/server";
import { ROLES } from "../../schema";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getLeads = query({
  args: {
    filter: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];
    
    const user = await ctx.db.get(userId);
    if (!user) return [];

    let leads;

    if (args.filter === "mine") {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", userId))
        .order("desc")
        .filter(q => q.neq(q.field("type"), "Irrelevant"))
        .take(1000);
    } else if (args.filter === "unassigned") {
      leads = await ctx.db.query("leads")
        .withIndex("by_last_activity")
        .order("desc")
        .filter(q => q.and(
          q.eq(q.field("assignedTo"), undefined),
          q.neq(q.field("type"), "Irrelevant"),
          q.or(
            q.eq(q.field("isColdCallerLead"), false),
            q.eq(q.field("isColdCallerLead"), undefined)
          )
        ))
        .take(1000);
    } else if (args.filter === "all") {
      if (user.role !== ROLES.ADMIN) return [];
      leads = await ctx.db.query("leads")
        .withIndex("by_last_activity")
        .order("desc")
        .filter(q => q.neq(q.field("type"), "Irrelevant"))
        .take(1000);
    } else {
      leads = await ctx.db.query("leads")
        .withIndex("by_last_activity")
        .order("desc")
        .filter(q => q.and(
          q.eq(q.field("assignedTo"), undefined),
          q.neq(q.field("type"), "Irrelevant"),
          q.or(
            q.eq(q.field("isColdCallerLead"), false),
            q.eq(q.field("isColdCallerLead"), undefined)
          )
        ))
        .take(1000);
    }

    if (user.role !== ROLES.ADMIN) {
      leads = leads.filter(l => l.source !== "R2 Test");
    }

    return leads;
  },
});

export const getLead = query({
  args: { 
    id: v.id("leads"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return null;

    const lead = await ctx.db.get(args.id);
    if (!lead) return null;

    if (lead.type === "Irrelevant") {
      const user = await ctx.db.get(userId);
      if (user?.role !== ROLES.ADMIN) {
        return null;
      }
    }

    return lead;
  },
});

export const getLeadById = query({
  args: { 
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.leadId);
  },
});

export const getLeadByIdInternal = internalQuery({
  args: { 
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.leadId);
  },
});

export const getLeadsWithUnreadCounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email || ""))
      .first();

    if (!user) return [];

    let leads = await ctx.db.query("leads")
      .withIndex("by_last_activity")
      .order("desc")
      .take(1000);
    
    if (user.role !== ROLES.ADMIN) {
      leads = leads.filter(l => l.source !== "R2 Test");
    }

    const leadsWithUnread = await Promise.all(
      leads.map(async (lead) => {
        const chat = await ctx.db
          .query("chats")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .first();
        
        return {
          ...lead,
          unreadCount: chat?.unreadCount ?? 0,
        };
      })
    );

    return leadsWithUnread;
  },
});