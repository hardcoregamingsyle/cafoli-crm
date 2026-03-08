import { v } from "convex/values";
import { query } from "../../_generated/server";
import { ROLES } from "../../schema";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUniqueSources = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    let isAdmin = false;
    if (userId) {
      const user = await ctx.db.get(userId);
      isAdmin = user?.role === ROLES.ADMIN;
    }

    // To get unique sources efficiently without scanning millions of leads,
    // we should ideally have a separate table for sources.
    // For now, we'll scan up to 5000 recent leads to find sources.
    const leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(5000);
    const sources = new Set<string>();
    
    for (const lead of leads) {
      if (lead.source) {
        if (!isAdmin && lead.source === "R2 Test") continue;
        sources.add(lead.source);
      }
    }
    
    return Array.from(sources).sort();
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

    // For export, we should use pagination, but since this is a single query,
    // we'll limit to 10000 to prevent memory crashes.
    const leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(10000);
    
    const enrichedLeads = await Promise.all(
      leads.map(async (lead) => {
        let assignedToName = "";
        if (lead.assignedTo) {
          const assignedUser = await ctx.db.get(lead.assignedTo);
          assignedToName = assignedUser?.name || "";
        }
        
        return { ...lead, assignedToName };
      })
    );

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
