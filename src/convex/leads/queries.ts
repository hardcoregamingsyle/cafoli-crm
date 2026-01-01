import { v } from "convex/values";
import { query } from "../_generated/server";
import { ROLES } from "../schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";

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

    // Helper function to enrich leads with assigned user names and tags
    const enrichLeads = async (leads: any[]) => {
      return await Promise.all(
        leads.map(async (lead) => {
          let enriched = { ...lead };
          
          if (lead.assignedTo) {
            const assignedUser = await ctx.db.get(lead.assignedTo);
            if (assignedUser && '_id' in assignedUser) {
              const userName = (assignedUser as any).name || (assignedUser as any).email || "Unknown User";
              enriched.assignedToName = userName;
            }
          }

          if (lead.tags && lead.tags.length > 0) {
            const tags = [];
            for (const tagId of lead.tags) {
              const tag = await ctx.db.get(tagId);
              if (tag) tags.push(tag);
            }
            enriched.tagsData = tags;
          }

          return enriched;
        })
      );
    };

    // Apply multi-filter logic
    const applyFilters = (leads: any[]) => {
      let filtered = leads;
      
      if (args.statuses && args.statuses.length > 0) {
        filtered = filtered.filter(l => l.status && args.statuses!.includes(l.status));
      }
      
      if (args.sources && args.sources.length > 0) {
        filtered = filtered.filter(l => l.source && args.sources!.includes(l.source));
      }
      
      if (args.tags && args.tags.length > 0) {
        filtered = filtered.filter(l => l.tags && args.tags!.some(t => l.tags!.includes(t)));
      }
      
      if (args.assignedToUsers && args.assignedToUsers.length > 0) {
        filtered = filtered.filter(l => l.assignedTo && args.assignedToUsers!.includes(l.assignedTo));
      }
      
      return filtered;
    };

    // Sorting logic
    const sortLeads = (leads: any[]) => {
      if (!args.sortBy) return leads;

      return leads.sort((a, b) => {
        switch (args.sortBy) {
          case "newest":
            return b._creationTime - a._creationTime;
          case "oldest":
            return a._creationTime - b._creationTime;
          case "last_activity":
            return (b.lastActivity || 0) - (a.lastActivity || 0);
          case "next_followup":
            if (a.nextFollowUpDate && b.nextFollowUpDate) return a.nextFollowUpDate - b.nextFollowUpDate;
            if (a.nextFollowUpDate) return -1;
            if (b.nextFollowUpDate) return 1;
            return 0;
          default:
            return 0;
        }
      });
    };

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
        .take(1000); // Increase limit for better search results

      results = applyFilters(results);
      results = sortLeads(results);
      const enrichedResults = await enrichLeads(results);
      return { page: enrichedResults, isDone: true, continueCursor: "" };
    }

    if (args.filter === "mine") {
      const allLeads = await ctx.db
        .query("leads")
        .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
        .collect();

      let activeLeads = allLeads.filter(l => l.type !== "Irrelevant");
      activeLeads = applyFilters(activeLeads);

      // Default sort if not specified
      if (!args.sortBy) {
        activeLeads.sort((a, b) => {
          const dateA = a.nextFollowUpDate;
          const dateB = b.nextFollowUpDate;
          
          if (dateA && dateB) {
            return dateA - dateB;
          }
          
          if (dateA) return -1;
          if (dateB) return 1;
          
          return b.lastActivity - a.lastActivity;
        });
      } else {
        activeLeads = sortLeads(activeLeads);
      }

      const { numItems, cursor } = args.paginationOpts;
      const offset = cursor ? parseInt(cursor) : 0;
      const page = activeLeads.slice(offset, offset + numItems);
      const isDone = offset + numItems >= activeLeads.length;
      const continueCursor = isDone ? "" : (offset + numItems).toString();

      const enrichedPage = await enrichLeads(page);
      return { page: enrichedPage, isDone, continueCursor };
    } else {
      // Check if any filters are applied or sorting is requested
      const hasFilters = (args.statuses && args.statuses.length > 0) ||
                        (args.sources && args.sources.length > 0) ||
                        (args.tags && args.tags.length > 0) ||
                        (args.assignedToUsers && args.assignedToUsers.length > 0) ||
                        args.sortBy;

      if (hasFilters) {
         const allLeads = await ctx.db.query("leads").order("desc").collect();
         let filtered = allLeads.filter(l => {
            if (args.filter === "unassigned") {
              return !l.assignedTo && 
                     l.type !== "Irrelevant" && 
                     !l.isColdCallerLead;
            }
            if (args.filter === "irrelevant") return l.type === "Irrelevant";
            if (args.filter === "all") return l.type !== "Irrelevant";
            return !l.assignedTo && l.type !== "Irrelevant" && !l.isColdCallerLead;
         });

         filtered = applyFilters(filtered);
         filtered = sortLeads(filtered);

         const { numItems, cursor } = args.paginationOpts;
         const offset = cursor ? parseInt(cursor) : 0;
         const page = filtered.slice(offset, offset + numItems);
         const isDone = offset + numItems >= filtered.length;
         const continueCursor = isDone ? "" : (offset + numItems).toString();
         
         const enrichedPage = await enrichLeads(page);
         return { page: enrichedPage, isDone, continueCursor };
      }

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
          } else {
            predicate = q.neq(q.field("type"), "Irrelevant");
          }

          return predicate;
        })
        .paginate(args.paginationOpts);

      const enrichedPage = await enrichLeads(result.page);
      return { ...result, page: enrichedPage };
    }
  },
});

export const getOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
      .collect();
    
    return leads
      .filter(l => l.type !== "Irrelevant" && l.nextFollowUpDate && l.nextFollowUpDate < now)
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
});

export const getCriticalOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
      .collect();
    
    return leads
      .filter(l => 
        l.type !== "Irrelevant" && 
        l.nextFollowUpDate && 
        l.nextFollowUpDate < now &&
        (l.status === "Hot" || l.status === "Mature")
      )
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
});

export const getColdOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
      .collect();
    
    return leads
      .filter(l => 
        l.type !== "Irrelevant" && 
        (l.status === "Cold" || l.type === "To be Decided") &&
        l.nextFollowUpDate && 
        l.nextFollowUpDate < now
      )
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
});

export const getLeads = query({
  args: {
    filter: v.optional(v.string()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) {
      console.error("getLeads called without userId and no auth context");
      return [];
    }
    
    const user = await ctx.db.get(userId);
    if (!user) {
      console.error("User not found for userId:", userId);
      return [];
    }

    let leads;

    if (args.filter === "mine") {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
        .order("desc")
        .collect();
      leads = leads.filter(l => l.type !== "Irrelevant");
    } else if (args.filter === "unassigned") {
      leads = await ctx.db.query("leads").order("desc").collect();
      leads = leads.filter(l => !l.assignedTo && l.type !== "Irrelevant" && !l.isColdCallerLead);
    } else if (args.filter === "all") {
      if (user.role !== ROLES.ADMIN) return [];
      leads = await ctx.db.query("leads").order("desc").collect();
      leads = leads.filter(l => l.type !== "Irrelevant");
    } else {
      leads = await ctx.db.query("leads").order("desc").collect();
      leads = leads.filter(l => !l.assignedTo && l.type !== "Irrelevant" && !l.isColdCallerLead);
    }

    return leads;
  },
});

export const getLead = query({
  args: { 
    id: v.id("leads"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(args.id);
  },
});

export const getComments = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .collect();

    const commentsWithUser = await Promise.all(
      comments.map(async (c) => {
        let userName = "System";
        let userImage = undefined;

        if (c.userId) {
          const user = await ctx.db.get(c.userId);
          userName = user?.name || "Unknown";
          userImage = user?.image;
        } else if (c.isSystem) {
          userName = "System";
        }

        return { ...c, userName, userImage };
      })
    );

    return commentsWithUser;
  },
});

export const getUniqueSources = query({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
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

    const leads = await ctx.db.query("leads").collect();
    
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

export const getLeadsWithUnreadCounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email || ""))
      .first();

    if (!user) return [];

    const leads = await ctx.db.query("leads").collect();
    
    // Get unread counts for each lead
    const leadsWithUnread = await Promise.all(
      leads.map(async (lead) => {
        const chat = await ctx.db
          .query("chats")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .first();
        
        return {
          ...lead,
          unreadCount: chat?.unreadCount ?? 0,
        };
      })
    );

    return leadsWithUnread;
  },
});

export const getMyLeadsWithoutFollowUp = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", args.userId))
      .filter((q) => q.eq(q.field("nextFollowUpDate"), undefined))
      .collect();
    
    return leads;
  },
});