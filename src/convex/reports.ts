import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { ROLES } from "./schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { LOG_CATEGORIES } from "./activityLogs";

export const getReportStats = internalQuery({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      // If no userId provided, generate overall stats
      const leads = await ctx.db
        .query("leads")
        .withIndex("by_creation_time", (q) => 
          q.gte("_creationTime", args.startDate).lte("_creationTime", args.endDate)
        )
        .collect();

      const followups = await ctx.db
        .query("followups")
        .withIndex("by_scheduled_at", (q) => 
          q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
        )
        .collect();

      return generateStats(ctx, leads, followups, true);
    }

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const isAdmin = user.role === ROLES.ADMIN;

    let leads = await ctx.db
      .query("leads")
      .withIndex("by_creation_time", (q) => 
        q.gte("_creationTime", args.startDate).lte("_creationTime", args.endDate)
      )
      .collect();

    if (!isAdmin) {
      leads = leads.filter(l => l.assignedTo === userId);
    }

    let followups = await ctx.db
      .query("followups")
      .withIndex("by_scheduled_at", (q) => 
        q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
      )
      .collect();

    if (!isAdmin) {
      followups = followups.filter(f => f.assignedTo === userId);
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
    // 1. Overall Stats
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_creation_time", (q) => 
        q.gte("_creationTime", args.startDate).lte("_creationTime", args.endDate)
      )
      .collect();

    const followups = await ctx.db
      .query("followups")
      .withIndex("by_scheduled_at", (q) => 
        q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
      )
      .collect();

    const overallStats = await generateStats(ctx, leads, followups, true);

    // 2. Per User Stats
    const users = await ctx.db.query("users").collect();
    const staffUsers = users.filter(u => u.role === "staff" || u.role === "admin");

    // Fetch Activity Logs for Emails
    const emailLogs = await ctx.db
      .query("activityLogs")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", args.startDate).lte("timestamp", args.endDate))
      .filter(q => q.eq(q.field("category"), LOG_CATEGORIES.EMAIL))
      .collect();

    // Fetch Messages for WhatsApp
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", args.startDate).lte("_creationTime", args.endDate))
      .collect();

    // Calculate Combined Communication Stats
    let totalEmailsSent = emailLogs.filter(l => l.action.includes("Sent")).length;
    let totalWhatsappSent = 0;
    let totalWhatsappReceived = 0;
    let totalWhatsappTemplates = 0;
    let totalWhatsappOutside24h = 0;

    messages.forEach(m => {
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
      whatsappOutside24h: totalWhatsappOutside24h
    };

    // Helper for counting
    const countBy = (items: any[], key: string) => {
      const counts: Record<string, number> = {};
      items.forEach(item => {
        const val = item[key] || "Unknown";
        counts[val] = (counts[val] || 0) + 1;
      });
      return counts;
    };

    const userStats = staffUsers.map(user => {
      const userId = user._id;
      
      const userLeads = leads.filter(l => l.assignedTo === userId);
      const userFollowups = followups.filter(f => f.assignedTo === userId);

      const sources = countBy(userLeads, "source");
      const status = countBy(userLeads, "status");
      const relevancy = countBy(userLeads, "type");

      // Punctuality
      let punctualityCounts = {
        "Overdue": 0,
        "Overdue-Completed": 0,
        "Timely-Completed": 0,
      };

      const now = Date.now();
      userFollowups.forEach(f => {
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
        punctuality: punctualityCounts
      };
    });

    return {
      overall: overallStats,
      userStats,
      communicationStats
    };
  },
});

async function generateStats(ctx: any, leads: any[], followups: any[], isAdmin: boolean) {
  const countBy = (items: any[], key: string) => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
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
    
    const userIds = Array.from(new Set(leads.map(l => l.assignedTo).filter((id): id is Id<"users"> => !!id)));
    const usersMap = new Map<string, string>();
    
    const users = await Promise.all(userIds.map(uid => ctx.db.get(uid)));
    users.forEach((u, i) => {
      if (u && u.name) usersMap.set(userIds[i], u.name);
    });

    leads.forEach(l => {
      const name = l.assignedTo ? (usersMap.get(l.assignedTo) || "Unknown User") : "Unassigned";
      assignmentCounts[name] = (assignmentCounts[name] || 0) + 1;
    });
    
    assignment = Object.entries(assignmentCounts).map(([name, count]) => ({ name, count }));
  }

  let punctualityCounts = {
    "Overdue": 0,
    "Overdue-Completed": 0,
    "Timely-Completed": 0,
  };

  const now = Date.now();

  followups.forEach(f => {
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

    let leads = await ctx.db
      .query("leads")
      .withIndex("by_creation_time", (q) => 
        q.gte("_creationTime", args.startDate).lte("_creationTime", args.endDate)
      )
      .collect();

    if (!isAdmin) {
      leads = leads.filter(l => l.assignedTo === userId);
    }

    let followups = await ctx.db
      .query("followups")
      .withIndex("by_scheduled_at", (q) => 
        q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
      )
      .collect();

    if (!isAdmin) {
      followups = followups.filter(f => f.assignedTo === userId);
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
        .filter(q => q.eq(q.field("name"), args.filterValue))
        .first();
      if (targetUser) targetUserId = targetUser._id;
    }

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_creation_time", (q) => 
        q.gte("_creationTime", args.startDate).lte("_creationTime", args.endDate)
      )
      .collect();

    return leads.filter(l => {
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
  }
});