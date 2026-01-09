import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
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

    // Get messages from all chats for this lead, ordered by creation time descending (latest first)
    const allMessages = [];
    for (const chat of chats) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .order("desc")
        .collect();
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
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    // Get leads with pagination - ordered by lastActivity descending (latest first)
    let leadsQuery = args.filter === "mine" && args.userId
      ? ctx.db
          .query("leads")
          .withIndex("by_assigned_to", (q) => q.eq("assignedTo", args.userId))
          .order("desc")
      : ctx.db
          .query("leads")
          .withIndex("by_last_activity")
          .order("desc");

    const result = await leadsQuery.paginate(args.paginationOpts);

    // Enrich leads with chat status
    const leadsWithChatStatus = await Promise.all(
      result.page.map(async (lead) => {
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

    // Sort by last message time (most recent first), prioritizing those with messages
    const sortedLeads = leadsWithChatStatus.sort((a, b) => {
      // Prioritize leads with actual messages
      const aHasMessages = a.lastMessageAt > 0;
      const bHasMessages = b.lastMessageAt > 0;

      if (aHasMessages && !bHasMessages) return -1;
      if (!aHasMessages && bHasMessages) return 1;

      // Both have messages or both don't - sort by timestamp (latest first)
      return b.lastMessageAt - a.lastMessageAt;
    });

    return {
      page: sortedLeads,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});