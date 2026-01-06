import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Update active chat session (called when user opens/interacts with chat)
export const updateActiveSession = mutation({
  args: {
    leadId: v.id("leads"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("activeChatSessions")
      .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastActivity: Date.now(),
      });
    } else {
      await ctx.db.insert("activeChatSessions", {
        leadId: args.leadId,
        userId: args.userId,
        lastActivity: Date.now(),
      });
    }
  },
});

// Remove active session (called when user closes chat)
export const removeActiveSession = mutation({
  args: {
    leadId: v.id("leads"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("activeChatSessions")
      .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Check if chat is actively being viewed (within last 30 seconds)
// Changed to internalQuery so it can be called from webhook without api type issues
export const isLeadChatActive = internalQuery({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("activeChatSessions")
      .withIndex("by_leadId", (q) => q.eq("leadId", args.leadId))
      .collect();

    const now = Date.now();
    const activeThreshold = 30 * 1000; // 30 seconds

    // Check if any session is active within the last 30 seconds
    return sessions.some((session) => now - session.lastActivity < activeThreshold);
  },
});

// Cleanup old sessions (can be called periodically)
export const cleanupOldSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("activeChatSessions").collect();
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const session of sessions) {
      if (now - session.lastActivity > staleThreshold) {
        await ctx.db.delete(session._id);
      }
    }
  },
});