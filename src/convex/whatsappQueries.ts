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
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const paginationOpts = args.paginationOpts ?? { numItems: 50, cursor: null };
    const limit = paginationOpts.numItems || 50;

    if (args.searchQuery) {
      // Search mode — search leads, then filter to those with chats
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
        .filter((l) => l.hasChat && !l.adminAssignmentRequired)
        .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

      const cursor = paginationOpts.cursor;
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

    // Standard mode — query chats directly sorted by lastMessageAt (most recent first)
    // This ensures ALL leads with chats appear, regardless of lead lastActivity
    const allChats = await ctx.db
      .query("chats")
      .order("desc")
      .take(500);

    // Sort by lastMessageAt descending
    allChats.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    // Enrich with lead data
    const enriched: any[] = [];
    for (const chat of allChats) {
      const lead = await ctx.db.get(chat.leadId);
      if (!lead) continue;
      if (lead.adminAssignmentRequired) continue;
      if (args.filter === "mine" && args.userId && lead.assignedTo !== args.userId) continue;

      enriched.push({
        ...lead,
        hasChat: true,
        unreadCount: chat.unreadCount || 0,
        lastMessageAt: chat.lastMessageAt || 0,
      });
    }

    // Manual pagination using cursor (leadId as cursor)
    const cursor = paginationOpts.cursor;
    const cursorIndex = cursor
      ? enriched.findIndex((l) => l._id === cursor) + 1
      : 0;
    const page = enriched.slice(cursorIndex, cursorIndex + limit);
    const isDone = cursorIndex + limit >= enriched.length;
    const nextCursor = isDone ? "" : (page[page.length - 1]?._id ?? "");

    return {
      page,
      isDone,
      continueCursor: nextCursor,
    };
  },
});

export const getBulkMessagingContacts = query({
  args: {
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all bulk contacts with status "sent" (not yet replied)
    const bulkContacts = await ctx.db
      .query("bulkContacts")
      .withIndex("by_status", (q) => q.eq("status", "sent"))
      .order("desc")
      .take(500);

    // Filter by search if provided
    const filtered = args.searchQuery
      ? bulkContacts.filter(
          (c) =>
            (c.name || "").toLowerCase().includes(args.searchQuery!.toLowerCase()) ||
            c.phoneNumber.includes(args.searchQuery!)
        )
      : bulkContacts;

    // Enrich with lead/chat info for message status
    const enriched = await Promise.all(
      filtered.map(async (contact) => {
        // Try to find a lead for this phone number
        const cleaned = contact.phoneNumber.replace(/\D/g, "");
        const tenDigit = cleaned.startsWith("91") && cleaned.length === 12 ? cleaned.slice(2) : cleaned;
        const twelveDigit = cleaned.length === 10 ? "91" + cleaned : cleaned;

        let lead = await ctx.db
          .query("leads")
          .withIndex("by_mobile", (q) => q.eq("mobile", twelveDigit))
          .first();

        if (!lead) {
          lead = await ctx.db
            .query("leads")
            .withIndex("by_mobile", (q) => q.eq("mobile", tenDigit))
            .first();
        }

        if (!lead) {
          lead = await ctx.db
            .query("leads")
            .withIndex("by_mobile", (q) => q.eq("mobile", contact.phoneNumber))
            .first();
        }

        let lastMessageStatus: string | null = null;
        let lastMessageAt: number = contact.sentAt;
        let unreadCount = 0;
        let leadId: string | null = null;
        let chatId: string | null = null;

        if (lead) {
          leadId = lead._id;
          const chat = await ctx.db
            .query("chats")
            .withIndex("by_lead", (q) => q.eq("leadId", lead!._id))
            .first();

          if (chat) {
            chatId = chat._id;
            unreadCount = chat.unreadCount || 0;
            lastMessageAt = chat.lastMessageAt || contact.sentAt;

            // Get the last outbound message status
            const lastMsg = await ctx.db
              .query("messages")
              .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
              .order("desc")
              .first();

            if (lastMsg) {
              lastMessageStatus = lastMsg.status || null;
            }
          }
        }

        return {
          ...contact,
          leadId,
          chatId,
          lastMessageStatus,
          lastMessageAt,
          unreadCount,
          // Use lead name if available, otherwise contact name
          displayName: (lead?.name) || contact.name || contact.phoneNumber,
        };
      })
    );

    // Sort by last message time (most recent first)
    enriched.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    return enriched;
  },
});