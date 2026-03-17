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
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.numItems || 50;

    // Fetch leads
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
      // Standard list
      if (args.filter === "mine" && args.userId) {
        leads = await ctx.db
          .query("leads")
          .withIndex("by_assigned_to_and_last_activity", (q) => q.eq("assignedTo", args.userId))
          .order("desc")
          .take(500);
      } else {
        leads = await ctx.db
          .query("leads")
          .withIndex("by_last_activity")
          .order("desc")
          .take(500);
      }
    }

    const leadsWithChatStatus = await Promise.all(
      leads.map(async (lead) => {
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

    const visibleLeads = leadsWithChatStatus
      .filter((lead) => lead.hasChat)
      .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    // Manual cursor-based pagination
    const cursorIndex = args.cursor
      ? visibleLeads.findIndex((l) => l._id === args.cursor) + 1
      : 0;
    const page = visibleLeads.slice(cursorIndex, cursorIndex + limit);
    const nextCursor = cursorIndex + limit < visibleLeads.length
      ? page[page.length - 1]?._id ?? null
      : null;

    return {
      page,
      nextCursor,
      isDone: nextCursor === null,
    };
  },
});