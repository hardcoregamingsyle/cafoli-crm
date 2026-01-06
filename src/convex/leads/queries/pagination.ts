import { v } from "convex/values";
import { query } from "../../_generated/server";
import { ROLES } from "../../schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { enrichLeads, applyFilters, sortLeads } from "./helpers";

export const getPaginatedLeads = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filter: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    search: v.optional(v.string()),
    statuses: v.optional(v.array(v.string())),
    sources: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.id("tags"))),
    assignedToUsers: v.optional(v.array(v.id("users"))),
    sortBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    
    if (!userId) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    if (args.filter === "irrelevant" && user.role !== ROLES.ADMIN) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    // Search logic
    if (args.search) {
      let results = await ctx.db
        .query("leads")
        .withSearchIndex("search_all", (q) => {
          let search = q.search("searchText", args.search!);
          if (args.filter === "mine") {
            search = search.eq("assignedTo", userId);
          }
          return search;
        })
        .take(1000);

      if (user.role !== ROLES.ADMIN) {
        results = results.filter(l => l.type !== "Irrelevant");
      }

      results = applyFilters(results, args);
      results = sortLeads(results, args.sortBy);
      const enrichedResults = await enrichLeads(ctx, results);
      return { page: enrichedResults, isDone: true, continueCursor: "" };
    }

    // "Mine" filter
    if (args.filter === "mine") {
      const allLeads = await ctx.db
        .query("leads")
        .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
        .collect();

      let activeLeads = allLeads.filter(l => l.type !== "Irrelevant");
      activeLeads = applyFilters(activeLeads, args);

      if (!args.sortBy) {
        activeLeads.sort((a, b) => {
          const dateA = a.nextFollowUpDate;
          const dateB = b.nextFollowUpDate;
          
          if (dateA && dateB) return dateA - dateB;
          if (dateA) return -1;
          if (dateB) return 1;
          
          return b.lastActivity - a.lastActivity;
        });
      } else {
        activeLeads = sortLeads(activeLeads, args.sortBy);
      }

      const { numItems, cursor } = args.paginationOpts;
      const offset = cursor ? parseInt(cursor) : 0;
      const page = activeLeads.slice(offset, offset + numItems);
      const isDone = offset + numItems >= activeLeads.length;
      const continueCursor = isDone ? "" : (offset + numItems).toString();

      const enrichedPage = await enrichLeads(ctx, page);
      return { page: enrichedPage, isDone, continueCursor };
    }

    // Other filters with in-memory processing
    const hasFilters = (args.statuses && args.statuses.length > 0) ||
                      (args.sources && args.sources.length > 0) ||
                      (args.tags && args.tags.length > 0) ||
                      (args.assignedToUsers && args.assignedToUsers.length > 0) ||
                      args.sortBy;

    if (hasFilters) {
      const allLeads = await ctx.db.query("leads").order("desc").collect();
      let filtered = allLeads.filter(l => {
        if (args.filter === "unassigned") {
          return !l.assignedTo && l.type !== "Irrelevant" && !l.isColdCallerLead;
        }
        if (args.filter === "irrelevant") return l.type === "Irrelevant";
        if (args.filter === "all") return l.type !== "Irrelevant";
        if (args.filter === "cold_caller") return l.isColdCallerLead === true;
        return !l.assignedTo && l.type !== "Irrelevant" && !l.isColdCallerLead;
      });

      filtered = applyFilters(filtered, args);
      filtered = sortLeads(filtered, args.sortBy);

      const { numItems, cursor } = args.paginationOpts;
      const offset = cursor ? parseInt(cursor) : 0;
      const page = filtered.slice(offset, offset + numItems);
      const isDone = offset + numItems >= filtered.length;
      const continueCursor = isDone ? "" : (offset + numItems).toString();
      
      const enrichedPage = await enrichLeads(ctx, page);
      return { page: enrichedPage, isDone, continueCursor };
    }

    // Default indexed query
    const result = await ctx.db
      .query("leads")
      .withIndex("by_last_activity")
      .order("desc")
      .filter((q) => {
        let predicate;
        
        if (args.filter === "unassigned") {
          predicate = q.and(
            q.eq(q.field("assignedTo"), undefined),
            q.neq(q.field("type"), "Irrelevant"),
            q.or(
              q.eq(q.field("isColdCallerLead"), false),
              q.eq(q.field("isColdCallerLead"), undefined)
            )
          );
        } else if (args.filter === "irrelevant") {
          predicate = q.eq(q.field("type"), "Irrelevant");
        } else if (args.filter === "cold_caller") {
          predicate = q.eq(q.field("isColdCallerLead"), true);
        } else {
          predicate = q.neq(q.field("type"), "Irrelevant");
        }

        return predicate;
      })
      .paginate(args.paginationOpts);

    const enrichedPage = await enrichLeads(ctx, result.page);
    return { ...result, page: enrichedPage };
  },
});
