import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ROLES } from "./schema";

export const getChatMessages = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    // Find the chat for this lead
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) {
      return [];
    }

    // Get all messages for this chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("asc")
      .collect();

    // Enrich messages with quoted message content if available
    const messagesWithQuotes = await Promise.all(
      messages.map(async (msg) => {
        let quotedMessage = null;
        if (msg.quotedMessageId) {
          quotedMessage = await ctx.db.get(msg.quotedMessageId);
        }
        return {
          ...msg,
          quotedMessage,
        };
      })
    );

    return messagesWithQuotes;
  },
});

export const getLeadsWithChatStatus = query({
  args: {
    filter: v.optional(v.string()), // "all", "mine"
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];
    
    const user = await ctx.db.get(userId);
    if (!user) return [];

    let leads;

    // 1. Fetch leads based on filter
    if (args.filter === "mine") {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
        .collect();
    } else {
      // "all" or default
      if (user.role !== ROLES.ADMIN && args.filter === "all") return []; // Safety check
      leads = await ctx.db.query("leads").collect();
    }

    // 2. Fetch chat info for these leads
    const leadsWithChat = await Promise.all(
      leads.map(async (lead) => {
        const chat = await ctx.db
          .query("chats")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .first();
        
        return {
          ...lead,
          lastMessageAt: chat?.lastMessageAt || 0,
          unreadCount: chat?.unreadCount || 0,
          chatId: chat?._id,
        };
      })
    );

    // 3. Sort by lastMessageAt (descending) or creation time for new leads
    return leadsWithChat.sort((a, b) => {
      const timeA = Math.max(a.lastMessageAt || 0, a._creationTime);
      const timeB = Math.max(b.lastMessageAt || 0, b._creationTime);
      return timeB - timeA;
    });
  },
});