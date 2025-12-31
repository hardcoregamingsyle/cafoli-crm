import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

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
    return await ctx.db.query("chats").collect();
  },
});

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
      .collect();
    
    // Enrich messages with quoted message data if they exist
    const enrichedMessages = await Promise.all(
      messages.map(async (message) => {
        if (message.quotedMessageId) {
          const quotedMessage = await ctx.db.get(message.quotedMessageId);
          return {
            ...message,
            quotedMessage,
          };
        }
        return message;
      })
    );
    
    return enrichedMessages;
  },
});

export const getLeadsWithChatStatus = query({
  args: { 
    filter: v.union(v.literal("all"), v.literal("mine")),
    userId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    // Filter by assigned user if "mine"
    const leads = args.filter === "mine" && args.userId
      ? await ctx.db
          .query("leads")
          .withIndex("by_assigned_to", (q) => q.eq("assignedTo", args.userId))
          .collect()
      : await ctx.db
          .query("leads")
          .withIndex("by_last_activity")
          .collect();
    
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
          lastMessageAt: chat?.lastMessageAt || 0,
        };
      })
    );
    
    // Sort by last message time (most recent first)
    return leadsWithChatStatus.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});