import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";

export const getChatsByLeadId = internalQuery({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
    
    const chatsWithMessages = await Promise.all(
      chats.map(async (chat) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
          .collect();
        
        return {
          ...chat,
          messages,
        };
      })
    );
    
    return chatsWithMessages;
  },
});

export const getAllChats = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("chats").order("desc").collect();
  },
});

export const getChatMessagesInternal = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
    
    const allMessages = [];
    for (const chat of chats) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .collect();
      allMessages.push(...messages);
    }
    
    return allMessages;
  },
});

export const getChatMessages = query({
  args: {
    leadId: v.id("leads"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();

    if (chats.length === 0) {
      return {
        page: [],
        isDone: true,
        continueCursor: null,
      };
    }

    // Get ALL messages from all chats for this lead
    const allMessages = [];
    
    for (const chat of chats) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .collect();
      allMessages.push(...messages);
    }

    // Sort all messages by creation time descending (newest first) for pagination
    const sortedMessages = allMessages.sort((a, b) => b._creationTime - a._creationTime);

    // Apply pagination manually
    const { numItems, cursor } = args.paginationOpts;
    const startIndex = cursor ? parseInt(cursor) : 0;
    const endIndex = startIndex + numItems;
    
    const paginatedMessages = sortedMessages.slice(startIndex, endIndex);
    const hasMore = endIndex < sortedMessages.length;
    
    return {
      page: paginatedMessages.reverse(), // Reverse back to ascending order for display
      isDone: !hasMore,
      continueCursor: hasMore ? endIndex.toString() : null,
    };
  },
});

export const getLeadsWithChatStatus = query({
  args: {
    filter: v.union(v.literal("all"), v.literal("mine")),
    userId: v.optional(v.id("users")),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Fetch ALL leads based on filter - no limits
    let leads;
    
    if (args.searchQuery) {
      // Use search index if query is provided - collect all results
      if (args.filter === "mine" && args.userId) {
        leads = await ctx.db
          .query("leads")
          .withSearchIndex("search_all", (q) => 
            q.search("searchText", args.searchQuery!)
             .eq("assignedTo", args.userId!)
          )
          .collect();
      } else {
        leads = await ctx.db
          .query("leads")
          .withSearchIndex("search_all", (q) => 
            q.search("searchText", args.searchQuery!)
          )
          .collect();
      }
    } else {
      // Standard list - fetch ALL leads
      if (args.filter === "mine" && args.userId) {
        leads = await ctx.db
          .query("leads")
          .withIndex("by_assigned_to_and_last_activity", (q) => q.eq("assignedTo", args.userId))
          .order("desc")
          .collect();
      } else {
        // For all leads, prioritize those with recent activity
        leads = await ctx.db
          .query("leads")
          .withIndex("by_last_activity")
          .order("desc")
          .collect();
      }
    }

    // Enrich leads with chat status
    const leadsWithChatStatus = await Promise.all(
      leads.map(async (lead) => {
        const chat = await ctx.db
          .query("chats")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .first();

        return {
          ...lead,
          unreadCount: chat?.unreadCount || 0,
          lastMessageAt: chat?.lastMessageAt || lead.lastActivity || 0,
        };
      })
    );

    // Sort by last message time (most recent first)
    const sortedLeads = leadsWithChatStatus.sort((a, b) => {
      // Prioritize leads with actual messages
      const aHasMessages = a.lastMessageAt > 0;
      const bHasMessages = b.lastMessageAt > 0;

      if (aHasMessages && !bHasMessages) return -1;
      if (!aHasMessages && bHasMessages) return 1;

      // Both have messages or both don't - sort by timestamp (latest first)
      return b.lastMessageAt - a.lastMessageAt;
    });

    return sortedLeads;
  },
});