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

    // Helper to map message to user
    // We need to cache chat -> lead -> assignedTo
    const chatMap = new Map<string, string>(); // chatId -> leadId
    const leadMap = new Map<string, string>(); // leadId -> userId

    // Pre-fetch chats and leads involved in messages
    const chatIds = [...new Set(messages.map(m => m.chatId))];
    
    // We can't fetch all chats efficiently if there are many, but we can try to fetch them as needed or in batches.
    // For now, let's fetch all chats (might be heavy, but safe for now) or just iterate.
    // Better: fetch chats by Id.
    
    for (const chatId of chatIds) {
      const chat = await ctx.db.get(chatId);
      if (chat) {
        chatMap.set(chatId, chat.leadId);
        if (!leadMap.has(chat.leadId)) {
          const lead = await ctx.db.get(chat.leadId);
          if (lead && lead.assignedTo) {
            leadMap.set(chat.leadId, lead.assignedTo);
          }
        }
      }
    }

    const userStats = staffUsers.map(user => {
      const userId = user._id;
      
      // Emails
      const emailsSent = emailLogs.filter(l => l.userId === userId && l.action.includes("Sent")).length;

      // WhatsApp
      let whatsappSent = 0;
      let whatsappReceived = 0;
      let whatsappTemplates = 0;
      let whatsappOutside24h = 0;

      messages.forEach(m => {
        const leadId = chatMap.get(m.chatId);
        if (leadId) {
          const assignedTo = leadMap.get(leadId);
          if (assignedTo === userId) {
            if (m.direction === "outbound") {
              whatsappSent++;
              if (m.messageType === "template") {
                whatsappTemplates++;
                whatsappOutside24h++; // Assuming templates are the ones outside 24h/chargeable
              }
            } else if (m.direction === "inbound") {
              whatsappReceived++;
            }
          }
        }
      });

      return {
        userId,
        name: user.name || "Unknown",
        emailsSent,
        whatsappSent,
        whatsappReceived,
        whatsappTemplates,
        whatsappOutside24h
      };
    });

    return {
      overall: overallStats,
      userStats
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