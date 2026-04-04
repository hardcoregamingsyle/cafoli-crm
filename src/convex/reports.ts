import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { ROLES } from "./schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { LOG_CATEGORIES } from "./activityLogs";

// Helper to extract lead fields from r2_leads_mock entries
function extractR2LeadFields(r2Lead: any) {
  const lead = r2Lead.leadData?.lead || r2Lead.leadData || {};
  return {
    _id: r2Lead._id,
    _creationTime: r2Lead._creationTime,
    source: r2Lead.source || lead.source,
    status: r2Lead.status || lead.status,
    type: lead.type,
    assignedTo: lead.assignedTo,
  };
}

// Helper: fetch leads in a date range using last_activity index (avoids missing by_creation_time index)
async function fetchLeadsInRange(ctx: any, startDate: number, endDate: number) {
  return await ctx.db
    .query("leads")
    .withIndex("by_last_activity", (q: any) =>
      q.gte("lastActivity", startDate).lte("lastActivity", endDate)
    )
    .collect();
}

export const getReportStats = internalQuery({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      const leads = await fetchLeadsInRange(ctx, args.startDate, args.endDate);

      // Include R2 leads in stats
      const r2Leads = await ctx.db.query("r2_leads_mock").take(5000);
      const r2InRange = r2Leads
        .filter((r: any) => r._creationTime >= args.startDate && r._creationTime <= args.endDate)
        .map(extractR2LeadFields);

      const allLeads = [...leads, ...r2InRange];

      const followups = await ctx.db
        .query("followups")
        .withIndex("by_scheduled_at", (q: any) =>
          q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
        )
        .collect();

      return generateStats(ctx, allLeads, followups, true);
    }

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const isAdmin = user.role === ROLES.ADMIN;

    let leads = await fetchLeadsInRange(ctx, args.startDate, args.endDate);

    // Include R2 leads for admins
    if (isAdmin) {
      const r2Leads = await ctx.db.query("r2_leads_mock").take(5000);
      const r2InRange = r2Leads
        .filter((r: any) => r._creationTime >= args.startDate && r._creationTime <= args.endDate)
        .map(extractR2LeadFields);
      leads = [...leads, ...r2InRange] as any[];
    } else {
      leads = leads.filter((l: any) => l.assignedTo === userId);
    }

    let followups = await ctx.db
      .query("followups")
      .withIndex("by_scheduled_at", (q: any) =>
        q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
      )
      .collect();

    if (!isAdmin) {
      followups = followups.filter((f: any) => f.assignedTo === userId);
    }

    return generateStats(ctx, leads, followups, isAdmin);
  },
});

export const getDetailedReportStats = internalQuery({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const leads = await fetchLeadsInRange(ctx, args.startDate, args.endDate);

    // Include R2 leads
    const r2Leads = await ctx.db.query("r2_leads_mock").take(5000);
    const r2InRange = r2Leads
      .filter((r: any) => r._creationTime >= args.startDate && r._creationTime <= args.endDate)
      .map(extractR2LeadFields);

    const allLeads = [...leads, ...r2InRange] as any[];

    const followups = await ctx.db
      .query("followups")
      .withIndex("by_scheduled_at", (q: any) =>
        q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
      )
      .collect();

    const overallStats = await generateStats(ctx, allLeads, followups, true);

    // Per User Stats
    const users = await ctx.db.query("users").collect();
    const staffUsers = users.filter((u: any) => u.role === "staff" || u.role === "admin");

    // Fetch Activity Logs for Emails
    const emailLogs = await ctx.db
      .query("activityLogs")
      .withIndex("by_timestamp", (q: any) => q.gte("timestamp", args.startDate).lte("timestamp", args.endDate))
      .filter((q: any) => q.eq(q.field("category"), LOG_CATEGORIES.EMAIL))
      .collect();

    // Fetch Messages for WhatsApp — use by_chat index isn't suitable here; scan with filter
    const allMessages = await ctx.db.query("messages").order("desc").take(10000);
    const messages = allMessages.filter(
      (m: any) => m._creationTime >= args.startDate && m._creationTime <= args.endDate
    );

    let totalEmailsSent = emailLogs.filter((l: any) => l.action.includes("Sent")).length;
    let totalWhatsappSent = 0;
    let totalWhatsappReceived = 0;
    let totalWhatsappTemplates = 0;
    let totalWhatsappOutside24h = 0;

    messages.forEach((m: any) => {
      if (m.direction === "outbound") {
        totalWhatsappSent++;
        if (m.messageType === "template") {
          totalWhatsappTemplates++;
          totalWhatsappOutside24h++;
        }
      } else if (m.direction === "inbound") {
        totalWhatsappReceived++;
      }
    });

    const communicationStats = {
      emailsSent: totalEmailsSent,
      whatsappSent: totalWhatsappSent,
      whatsappReceived: totalWhatsappReceived,
      whatsappTemplates: totalWhatsappTemplates,
      whatsappOutside24h: totalWhatsappOutside24h,
    };

    const countBy = (items: any[], key: string) => {
      const counts: Record<string, number> = {};
      items.forEach((item: any) => {
        const val = item[key] || "Unknown";
        counts[val] = (counts[val] || 0) + 1;
      });
      return counts;
    };

    const userStats = staffUsers.map((user: any) => {
      const userId = user._id;
      const userLeads = leads.filter((l: any) => l.assignedTo === userId);
      const userFollowups = followups.filter((f: any) => f.assignedTo === userId);

      const sources = countBy(userLeads, "source");
      const status = countBy(userLeads, "status");
      const relevancy = countBy(userLeads, "type");

      let punctualityCounts = {
        "Overdue": 0,
        "Overdue-Completed": 0,
        "Timely-Completed": 0,
      };

      const now = Date.now();
      userFollowups.forEach((f: any) => {
        if (f.status === "completed") {
          if (f.completionStatus === "overdue") {
            punctualityCounts["Overdue-Completed"]++;
          } else {
            punctualityCounts["Timely-Completed"]++;
          }
        } else if (f.status === "pending") {
          if (now > f.scheduledAt + 20 * 60 * 1000) {
            punctualityCounts["Overdue"]++;
          }
        }
      });

      return {
        userId,
        name: user.name || "Unknown",
        leadsAssigned: userLeads.length,
        sources,
        status,
        relevancy,
        punctuality: punctualityCounts,
      };
    });

    return {
      overall: overallStats,
      userStats,
      communicationStats,
    };
  },
});

async function generateStats(ctx: any, leads: any[], followups: any[], isAdmin: boolean) {
  const countBy = (items: any[], key: string) => {
    const counts: Record<string, number> = {};
    items.forEach((item: any) => {
      const val = item[key] || "Unknown";
      counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  };

  const sources = countBy(leads, "source");
  const status = countBy(leads, "status");
  const relevancy = countBy(leads, "type");

  let assignment: { name: string; count: number }[] = [];
  if (isAdmin) {
    const assignmentCounts: Record<string, number> = {};
    const userIds = Array.from(new Set(leads.map((l: any) => l.assignedTo).filter((id: any): id is Id<"users"> => !!id)));
    const usersMap = new Map<string, string>();
    const users = await Promise.all(userIds.map((uid: any) => ctx.db.get(uid)));
    users.forEach((u: any, i: number) => {
      if (u && u.name && u.role !== "owner") usersMap.set(userIds[i], u.name);
    });

    leads.forEach((l: any) => {
      if (l.assignedTo) {
        const userName = usersMap.get(l.assignedTo);
        if (userName) {
          assignmentCounts[userName] = (assignmentCounts[userName] || 0) + 1;
        }
      } else {
        assignmentCounts["Unassigned"] = (assignmentCounts["Unassigned"] || 0) + 1;
      }
    });

    assignment = Object.entries(assignmentCounts).map(([name, count]) => ({ name, count }));
  }

  let punctualityCounts = {
    "Overdue": 0,
    "Overdue-Completed": 0,
    "Timely-Completed": 0,
  };

  const now = Date.now();
  followups.forEach((f: any) => {
    if (f.status === "completed") {
      if (f.completionStatus === "overdue") {
        punctualityCounts["Overdue-Completed"]++;
      } else {
        punctualityCounts["Timely-Completed"]++;
      }
    } else if (f.status === "pending") {
      if (now > f.scheduledAt + 20 * 60 * 1000) {
        punctualityCounts["Overdue"]++;
      }
    }
  });

  const punctuality = Object.entries(punctualityCounts).map(([name, count]) => ({ name, count }));

  return {
    totalLeads: leads.length,
    sources,
    status,
    relevancy,
    assignment,
    punctuality,
  };
}

export const getReportStatsPublic = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const isAdmin = user.role === ROLES.ADMIN;

    let leads = await fetchLeadsInRange(ctx, args.startDate, args.endDate);

    if (isAdmin) {
      const r2Leads = await ctx.db.query("r2_leads_mock").take(5000);
      const r2InRange = r2Leads
        .filter((r: any) => r._creationTime >= args.startDate && r._creationTime <= args.endDate)
        .map(extractR2LeadFields);
      leads = [...leads, ...r2InRange] as any[];
    } else {
      leads = leads.filter((l: any) => l.assignedTo === userId);
    }

    let followups = await ctx.db
      .query("followups")
      .withIndex("by_scheduled_at", (q: any) =>
        q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
      )
      .collect();

    if (!isAdmin) {
      followups = followups.filter((f: any) => f.assignedTo === userId);
    }

    return generateStats(ctx, leads, followups, isAdmin);
  },
});

export const getLeadsByFilter = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    filterType: v.string(),
    filterValue: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
    if (!user) return [];
    const isAdmin = user.role === ROLES.ADMIN;

    let targetUserId: string | undefined;
    if (args.filterType === "assignedTo" && args.filterValue !== "Unassigned") {
      const targetUser = await ctx.db
        .query("users")
        .filter((q: any) => q.eq(q.field("name"), args.filterValue))
        .first();
      if (targetUser) targetUserId = targetUser._id;
    }

    const leads = await fetchLeadsInRange(ctx, args.startDate, args.endDate);

    return leads.filter((l: any) => {
      if (!isAdmin && l.assignedTo !== userId) return false;

      if (args.filterType === "source") return l.source === args.filterValue;
      if (args.filterType === "status") return l.status === args.filterValue;
      if (args.filterType === "type") return l.type === args.filterValue;
      if (args.filterType === "assignedTo") {
        if (args.filterValue === "Unassigned") return !l.assignedTo;
        if (targetUserId) return l.assignedTo === targetUserId;
        return false;
      }
      return true;
    });
  },
});