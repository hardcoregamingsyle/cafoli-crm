import { v } from "convex/values";
import { query } from "../../_generated/server";
import { ROLES } from "../../schema";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUniqueSources = query({
  args: {},
  handler: async (ctx) => {
    // Use the leadSourcesCache singleton for O(1) read
    const cache = await ctx.db.query("leadSourcesCache").first();
    if (cache) return cache.sources;
    // Fallback: scan up to 2000 leads if cache not yet populated
    const leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(2000);
    const sources = new Set<string>();
    for (const lead of leads) {
      if (lead.source) sources.add(lead.source);
    }
    return Array.from(sources).sort();
  },
});

// Lightweight dashboard stats — reads only what's needed
export const getDashboardStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const isAdmin = user.role === ROLES.ADMIN;
    const now = Date.now();
    const oneDayAgo = now - 86400000;

    // Get recent leads for stats (last 100 is enough for dashboard)
    let recentLeads;
    if (isAdmin) {
      recentLeads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(100);
    } else {
      recentLeads = await ctx.db
        .query("leads")
        .withIndex("by_assignedTo", q => q.eq("assignedTo", args.userId))
        .order("desc")
        .take(100);
    }

    // Count total leads (use cached sources count as proxy, or just count index)
    // For total count, use a lightweight index scan
    const totalSample = isAdmin
      ? await ctx.db.query("leads").withIndex("by_last_activity").take(5000)
      : await ctx.db.query("leads").withIndex("by_assignedTo", q => q.eq("assignedTo", args.userId)).take(1000);

    const newLeadsToday = totalSample.filter(l => l._creationTime > oneDayAgo).length;
    const pendingFollowUps = totalSample.filter(l => l.nextFollowUpDate && l.nextFollowUpDate < now).length;

    // R2 count from cache table
    const r2Count = await ctx.db.query("r2_leads_mock").take(1000);

    return {
      totalLeads: totalSample.length + r2Count.length,
      convexCount: totalSample.length,
      r2Count: r2Count.length,
      newLeadsToday,
      pendingFollowUps,
      recentLeads: recentLeads.slice(0, 5),
    };
  },
});

export const getAllLeadsForExport = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");
    
    const user = await ctx.db.get(userId);
    if (user?.role !== ROLES.ADMIN) {
      throw new Error("Only admins can export all leads");
    }

    const clean = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      return String(v).replace(/[\r\n\t]+/g, " ").trim();
    };

    const convexLeads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(10000);
    
    // Batch fetch all assigned users
    const assignedUserIds = [...new Set(convexLeads.map(l => l.assignedTo).filter(Boolean))] as any[];
    const userDocs = await Promise.all(assignedUserIds.map(id => ctx.db.get(id)));
    const userMap = new Map(assignedUserIds.map((id, i) => [id, userDocs[i]]));

    const enrichedLeads = convexLeads.map((lead) => {
      const assignedUser = lead.assignedTo ? userMap.get(lead.assignedTo) : null;
      const assignedToName = (assignedUser as any)?.name || "";
      return {
        name: clean(lead.name),
        subject: clean(lead.subject),
        source: clean(lead.source),
        mobile: clean(lead.mobile),
        altMobile: clean(lead.altMobile),
        email: clean(lead.email),
        altEmail: clean(lead.altEmail),
        agencyName: clean(lead.agencyName),
        pincode: clean(lead.pincode),
        state: clean(lead.state),
        district: clean(lead.district),
        station: clean(lead.station),
        message: clean(lead.message),
        status: clean(lead.status),
        type: clean(lead.type),
        assignedTo: lead.assignedTo ?? null,
        assignedToName: clean(assignedToName),
        nextFollowUpDate: lead.nextFollowUpDate ?? null,
        lastActivity: lead.lastActivity,
        pharmavendsUid: clean(lead.pharmavendsUid),
        indiamartUniqueId: clean(lead.indiamartUniqueId),
        _id: lead._id,
        _creationTime: lead._creationTime,
        _isR2: false,
      };
    });

    return enrichedLeads;
  },
});

export const getNextDownloadNumber = query({
  args: {},
  handler: async (ctx) => {
    const lastExport = await ctx.db
      .query("exportLogs")
      .order("desc")
      .first();
    
    return (lastExport?.downloadNumber || 0) + 1;
  },
});