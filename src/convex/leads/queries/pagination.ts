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
    includeR2: v.optional(v.boolean()),
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
      const isAdmin = user.role === ROLES.ADMIN;
      let searchQuery = ctx.db
        .query("leads")
        .withSearchIndex("search_all", (q) => {
          let search = q.search("searchText", args.search!);
          if (!isAdmin) {
            search = search.eq("assignedTo", userId);
          }
          if (args.statuses && args.statuses.length === 1 && args.statuses[0] !== "All") {
            search = search.eq("status", args.statuses[0]);
          }
          return search;
        });
      
      let results = await searchQuery.collect();
      
      if (user.role !== ROLES.ADMIN) {
        results = results.filter(l => l.type !== "Irrelevant" && l.source !== "R2 Test");
      }

      // Also search R2 if includeR2 is true
      if (args.includeR2) {
        const r2Results = await ctx.db
          .query("r2_leads_mock")
          .withSearchIndex("search_all", (q) => q.search("searchText", args.search!))
          .take(20);
        
        // Convert R2 results to lead-like objects
        const r2AsLeads = r2Results.map((r2) => ({
          ...r2.leadData?.lead,
          _id: r2._id,
          _creationTime: r2._creationTime,
          _isR2: true,
          r2Id: r2._id,
          name: r2.name || r2.leadData?.lead?.name || "Unknown",
          mobile: r2.mobile || r2.leadData?.lead?.mobile || "",
          status: r2.status || r2.leadData?.lead?.status || "Cold",
          source: r2.source || r2.leadData?.lead?.source,
          lastActivity: r2.leadData?.lead?.lastActivity || r2._creationTime,
        }));
        
        results = [...results, ...r2AsLeads as any];
      }

      results = applyFilters(results, args);
      results = sortLeads(results, args.sortBy);
      const enrichedResults = await enrichLeads(ctx, results);
      return { page: enrichedResults, isDone: true, continueCursor: "" };
    }

    // "Mine" filter
    if (args.filter === "mine") {
      const result = await ctx.db
        .query("leads")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", userId))
        .order("desc")
        .filter((q) => {
          let predicate = q.neq(q.field("type"), "Irrelevant");
          if (user.role !== ROLES.ADMIN) {
            predicate = q.and(predicate, q.neq(q.field("source"), "R2 Test"));
          }
          
          if (args.statuses && args.statuses.length > 0 && !args.statuses.includes("All")) {
            const statusConditions = args.statuses.map(s => q.eq(q.field("status"), s));
            predicate = q.and(predicate, q.or(...statusConditions));
          }
          
          if (args.sources && args.sources.length > 0 && !args.sources.includes("All")) {
            const sourceConditions = args.sources.map(s => q.eq(q.field("source"), s));
            predicate = q.and(predicate, q.or(...sourceConditions));
          }
          
          return predicate;
        })
        .paginate(args.paginationOpts);

      let page = result.page;
      
      if (args.tags && args.tags.length > 0) {
        page = page.filter(lead => 
          lead.tags && args.tags!.some(tagId => lead.tags!.includes(tagId))
        );
      }

      if (!args.sortBy) {
        page.sort((a, b) => {
          const dateA = a.nextFollowUpDate;
          const dateB = b.nextFollowUpDate;
          
          if (dateA && dateB) return dateA - dateB;
          if (dateA) return -1;
          if (dateB) return 1;
          
          return b.lastActivity - a.lastActivity;
        });
      } else {
        page = sortLeads(page, args.sortBy);
      }

      const enrichedPage = await enrichLeads(ctx, page);
      return { ...result, page: enrichedPage };
    }

    // Other filters
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

        if (user.role !== ROLES.ADMIN) {
          predicate = q.and(predicate, q.neq(q.field("source"), "R2 Test"));
        }

        if (args.statuses && args.statuses.length > 0 && !args.statuses.includes("All")) {
          const statusConditions = args.statuses.map(s => q.eq(q.field("status"), s));
          predicate = q.and(predicate, q.or(...statusConditions));
        }
        
        if (args.sources && args.sources.length > 0 && !args.sources.includes("All")) {
          const sourceConditions = args.sources.map(s => q.eq(q.field("source"), s));
          predicate = q.and(predicate, q.or(...sourceConditions));
        }

        if (args.assignedToUsers && args.assignedToUsers.length > 0) {
          const assignedConditions = args.assignedToUsers.map(u => q.eq(q.field("assignedTo"), u));
          predicate = q.and(predicate, q.or(...assignedConditions));
        }

        return predicate;
      })
      .paginate(args.paginationOpts);

    let page = result.page;
    
    if (args.tags && args.tags.length > 0) {
      page = page.filter(lead => 
        lead.tags && args.tags!.some(tagId => lead.tags!.includes(tagId))
      );
    }

    if (args.sortBy) {
      page = sortLeads(page, args.sortBy);
    }

    const enrichedPage = await enrichLeads(ctx, page);
    return { ...result, page: enrichedPage };
  },
});