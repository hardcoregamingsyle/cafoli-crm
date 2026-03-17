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
    return await ctx.db.query("chats").order("desc").take(100);
  },
});

export const getChatMessagesInternal = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();
    
    if (!chat) return [];

    // Only fetch the last 20 messages for context
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("desc")
      .take(20);
    
    return messages.reverse();
  },
});

export const getChatMessages = query({
  args: {
    leadId: v.id("leads"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    // Use standard pagination on the messages table
    // We order by desc (newest first) so pagination works efficiently from the most recent
    return await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getLeadsWithChatStatus = query({
  args: {
    filter: v.union(v.literal("all"), v.literal("mine")),
    userId: v.optional(v.id("users")),
    searchQuery: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const limit = args.paginationOpts.numItems || 50;

    // Fetch paginated leads from the DB using proper indexes
    let paginatedLeads;

    if (args.searchQuery) {
      // Search mode — use search index, no native pagination support, take a reasonable cap
      let rawLeads;
      if (args.filter === "mine" && args.userId) {
        rawLeads = await ctx.db
          .query("leads")
          .withSearchIndex("search_all", (q) =>
            q.search("searchText", args.searchQuery!).eq("assignedTo", args.userId!)
          )
          .take(200);
      } else {
        rawLeads = await ctx.db
          .query("leads")
          .withSearchIndex("search_all", (q) =>
            q.search("searchText", args.searchQuery!)
          )
          .take(200);
      }

      // Enrich with chat status
      const enriched = await Promise.all(
        rawLeads.map(async (lead) => {
          const chat = await ctx.db
            .query("chats")
            .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
            .first();
          return {
            ...lead,
            hasChat: !!chat,
            unreadCount: chat?.unreadCount || 0,
            lastMessageAt: chat?.lastMessageAt || 0,
          };
        })
      );

      const visibleLeads = enriched
        .filter((l) => l.hasChat)
        .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

      // Manual pagination for search results
      const cursor = args.paginationOpts.cursor;
      const cursorIndex = cursor
        ? visibleLeads.findIndex((l) => l._id === cursor) + 1
        : 0;
      const page = visibleLeads.slice(cursorIndex, cursorIndex + limit);
      const nextCursor =
        cursorIndex + limit < visibleLeads.length
          ? (page[page.length - 1]?._id ?? null)
          : null;

      return { page, isDone: nextCursor === null, continueCursor: nextCursor ?? "" };
    }

    // Standard mode — use native Convex pagination on index
    if (args.filter === "mine" && args.userId) {
      paginatedLeads = await ctx.db
        .query("leads")
        .withIndex("by_assigned_to_and_last_activity", (q) =>
          q.eq("assignedTo", args.userId)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      paginatedLeads = await ctx.db
        .query("leads")
        .withIndex("by_last_activity")
        .order("desc")
        .paginate(args.paginationOpts);
    }

    // Enrich with chat status
    const enriched = await Promise.all(
      paginatedLeads.page.map(async (lead) => {
        const chat = await ctx.db
          .query("chats")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .first();
        return {
          ...lead,
          hasChat: !!chat,
          unreadCount: chat?.unreadCount || 0,
          lastMessageAt: chat?.lastMessageAt || 0,
        };
      })
    );

    // Only return leads that have chats, sorted by last message
    const visibleLeads = enriched
      .filter((l) => l.hasChat)
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    return {
      page: visibleLeads,
      isDone: paginatedLeads.isDone,
      continueCursor: paginatedLeads.continueCursor,
    };
  },
});