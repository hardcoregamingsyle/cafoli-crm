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

    // Optimization: If only one chat (common case), use native pagination
    if (chats.length === 1) {
      const result = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chats[0]._id))
        .order("desc")
        .paginate(args.paginationOpts);
      
      // Reverse page to show oldest to newest (standard chat UI)
      return {
        ...result,
        page: result.page.reverse(),
      };
    }

    // Get messages from all chats for this lead, ordered by creation time descending (latest first)
    const allMessages = [];
    // Limit total messages fetched per chat to avoid memory issues
    const limitPerChat = args.paginationOpts.numItems * 2; 
    
    for (const chat of chats) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .order("desc")
        .take(limitPerChat);
      allMessages.push(...messages);
    }

    // Sort all messages by creation time descending (latest first)
    const sortedMessages = allMessages.sort((a, b) => b._creationTime - a._creationTime);

    // Manual pagination
    const cursor = args.paginationOpts.cursor;
    const numItems = args.paginationOpts.numItems;

    let startIndex = 0;
    if (cursor) {
      // Find the message with this cursor (using _id as cursor)
      const cursorIndex = sortedMessages.findIndex(m => m._id === cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const page = sortedMessages.slice(startIndex, startIndex + numItems);
    const isDone = startIndex + numItems >= sortedMessages.length;
    const continueCursor = isDone ? null : page[page.length - 1]?._id || null;

    // Reverse the page to show oldest to newest in the UI
    return {
      page: page.reverse(),
      isDone,
      continueCursor,
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
    // Fetch leads based on filter
    let leads;
    
    if (args.searchQuery) {
      // Use search index if query is provided
      if (args.filter === "mine" && args.userId) {
        leads = await ctx.db
          .query("leads")
          .withSearchIndex("search_all", (q) => 
            q.search("searchText", args.searchQuery!)
             .eq("assignedTo", args.userId!)
          )
          .take(50);
      } else {
        leads = await ctx.db
          .query("leads")
          .withSearchIndex("search_all", (q) => 
            q.search("searchText", args.searchQuery!)
          )
          .take(50);
      }
    } else {
      // Standard list
      if (args.filter === "mine" && args.userId) {
        leads = await ctx.db
          .query("leads")
          .withIndex("by_assigned_to_and_last_activity", (q) => q.eq("assignedTo", args.userId))
          .order("desc")
          .take(200);
      } else {
        // For all leads, prioritize those with recent activity
        leads = await ctx.db
          .query("leads")
          .withIndex("by_last_activity")
          .order("desc")
          .take(200);
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