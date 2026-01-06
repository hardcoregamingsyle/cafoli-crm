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

export const getChatMessages: any = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(internal.whatsappQueries.getChatMessagesInternal, args);
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
          .order("desc")
          .collect()
      : await ctx.db
          .query("leads")
          .withIndex("by_last_activity")
          .order("desc")
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
          lastMessageAt: chat?.lastMessageAt || lead.lastActivity || 0,
        };
      })
    );
    
    // Sort by last message time (most recent first), prioritizing those with messages
    return leadsWithChatStatus.sort((a, b) => {
      // Prioritize leads with actual messages
      const aHasMessages = a.lastMessageAt > 0;
      const bHasMessages = b.lastMessageAt > 0;
      
      if (aHasMessages && !bHasMessages) return -1;
      if (!aHasMessages && bHasMessages) return 1;
      
      // Both have messages or both don't - sort by timestamp
      return b.lastMessageAt - a.lastMessageAt;
    });
  },
});