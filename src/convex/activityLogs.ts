import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const LOG_CATEGORIES = {
  WHATSAPP_INCOMING: "whatsapp_incoming",
  WHATSAPP_OUTGOING: "whatsapp_outgoing",
  WHATSAPP_STATUS: "whatsapp_status",
  LEAD_INCOMING: "lead_incoming",
  EMAIL: "email",
} as const;

export const logActivity = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    action: v.string(),
    details: v.string(),
    leadId: v.optional(v.id("leads")),
    category: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const timestamp = Date.now();
    return await ctx.db.insert("activityLogs", {
      ...args,
      timestamp,
    });
  },
});

export const log = mutation({
  args: {
    userId: v.id("users"),
    action: v.string(),
    details: v.string(),
    leadId: v.optional(v.id("leads")),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const timestamp = Date.now();
    return await ctx.db.insert("activityLogs", {
      ...args,
      timestamp,
    });
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activityLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getByLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activityLogs")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .collect();
  },
});

export const getByUser = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = ctx.db
      .query("activityLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc");
    
    if (args.limit) {
      return await q.take(args.limit);
    }
    return await q.collect();
  },
});

export const getByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activityLogs")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .order("desc")
      .collect();
  },
});

export const getLogs = query({
  args: {
    adminId: v.id("users"),
    category: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify admin
    const user = await ctx.db.get(args.adminId);
    if (!user || user.role !== "admin") return { logs: [], nextCursor: null };

    const pageSize = args.limit ?? 100;
    let q = ctx.db.query("activityLogs").withIndex("by_timestamp").order("desc");

    // Fetch extra to support cursor-based pagination
    const allResults = await q.take(pageSize * 10);

    const filtered = allResults.filter((log) => {
      if (args.category && log.category !== args.category) return false;
      if (args.startDate && log.timestamp < args.startDate) return false;
      if (args.endDate && log.timestamp > args.endDate) return false;
      return true;
    });

    // Apply cursor offset
    let startIdx = 0;
    if (args.cursor) {
      const idx = filtered.findIndex((l) => l._id === args.cursor);
      if (idx !== -1) startIdx = idx + 1;
    }

    const page = filtered.slice(startIdx, startIdx + pageSize);
    const nextCursor = page.length === pageSize ? page[page.length - 1]._id : null;

    // Resolve user names and lead names server-side
    const userCache: Record<string, string> = {};
    const leadCache: Record<string, string> = {};

    const enriched = await Promise.all(
      page.map(async (log) => {
        let userName = "System";
        if (log.userId) {
          if (!userCache[log.userId]) {
            const u = await ctx.db.get(log.userId);
            userCache[log.userId] = u?.name ?? u?.email ?? "Unknown User";
          }
          userName = userCache[log.userId];
        }

        let leadName: string | undefined;
        if (log.leadId) {
          if (!leadCache[log.leadId]) {
            const lead = await ctx.db.get(log.leadId);
            leadCache[log.leadId] = lead?.name ?? "Unknown Lead";
          }
          leadName = leadCache[log.leadId];
        }

        return { ...log, userName, leadName };
      })
    );

    return { logs: enriched, nextCursor };
  },
});

export const getLogStats = query({
  args: {
    adminId: v.id("users"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.adminId);
    if (!user || user.role !== "admin") return { total: 0, byCategory: {} };

    const logs = await ctx.db.query("activityLogs").withIndex("by_timestamp").order("desc").take(1000);

    const filtered = logs.filter((log) => {
      if (args.startDate && log.timestamp < args.startDate) return false;
      if (args.endDate && log.timestamp > args.endDate) return false;
      return true;
    });

    const byCategory: Record<string, number> = {};
    for (const log of filtered) {
      const cat = log.category ?? "Other";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }

    return { total: filtered.length, byCategory };
  },
});

export const cleanupOldLogs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
    const oldLogs = await ctx.db
      .query("activityLogs")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
      .take(500);
    for (const log of oldLogs) {
      await ctx.db.delete(log._id);
    }
    return { deleted: oldLogs.length };
  },
});