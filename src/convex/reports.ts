import { v } from "convex/values";
import { query } from "./_generated/server";
import { ROLES } from "./schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

export const getReportStats = query({
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

    // Fetch leads created in the date range
    // Note: We use _creationTime for general stats
    let leadsQuery = ctx.db
      .query("leads")
      .withIndex("by_creation_time", (q) => 
        q.gte("_creationTime", args.startDate).lte("_creationTime", args.endDate)
      );
    
    let leads = await leadsQuery.collect();

    // If not admin, filter leads to only those assigned to the user
    if (!isAdmin) {
      leads = leads.filter(l => l.assignedTo === userId);
    }

    // Fetch follow-ups in the date range (scheduled or completed)
    // We'll look at scheduledAt for punctuality stats in this period
    let followups = await ctx.db
      .query("followups")
      .withIndex("by_scheduled_at", (q) => 
        q.gte("scheduledAt", args.startDate).lte("scheduledAt", args.endDate)
      )
      .collect();

    // If not admin, filter followups to only those assigned to the user
    if (!isAdmin) {
      followups = followups.filter(f => f.assignedTo === userId);
    }

    // Aggregation Helpers
    const countBy = (items: any[], key: string) => {
      const counts: Record<string, number> = {};
      items.forEach(item => {
        const val = item[key] || "Unknown";
        counts[val] = (counts[val] || 0) + 1;
      });
      return Object.entries(counts).map(([name, count]) => ({ name, count }));
    };

    // 1. Lead Source
    const sources = countBy(leads, "source");

    // 2. Lead Status
    const status = countBy(leads, "status");

    // 3. Lead Relevancy
    const relevancy = countBy(leads, "type");

    // 4. Assignment (Admin only)
    let assignment: { name: string; count: number }[] = [];
    if (isAdmin) {
      const assignmentCounts: Record<string, number> = {};
      
      // Pre-fetch user names for better display
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

    // 5. Follow-up Punctuality
    // Categories: "Overdue", "Overdue-Completed", "Timely-Completed"
    // We need to check current status of followups scheduled in this range
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
        // Check if it is currently overdue
        if (now > f.scheduledAt + 20 * 60 * 1000) {
          punctualityCounts["Overdue"]++;
        }
        // If pending but not overdue yet, we don't count it in these specific buckets or maybe "Pending"?
        // The requirement asks for "Overdue, Overdue-Completed, Timely-Completed".
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
  },
});

export const getLeadsByFilter = query({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    filterType: v.string(), // "source", "status", "type", "assignedTo"
    filterValue: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
    if (!user) return [];
    const isAdmin = user.role === ROLES.ADMIN;

    // Resolve user ID if filtering by assignment
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

    // Filter in memory for simplicity as we have complex criteria
    // In a real app with millions of rows, we'd use specific indexes
    
    return leads.filter(l => {
      // Security check: if not admin, only show assigned leads
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