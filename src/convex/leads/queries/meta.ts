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

    const leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(5000);
    const sources = new Set<string>();
    
    for (const lead of leads) {
      if (lead.source) {
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

    // Helper: sanitize string fields — strip newlines, tabs, carriage returns
    const clean = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      return String(v).replace(/[\r\n\t]+/g, " ").trim();
    };

    // Fetch all Convex leads (up to 10000)
    const convexLeads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(10000);
    
    const enrichedLeads = await Promise.all(
      convexLeads.map(async (lead) => {
        let assignedToName = "";
        if (lead.assignedTo) {
          const assignedUser = await ctx.db.get(lead.assignedTo);
          assignedToName = assignedUser?.name || "";
        }
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