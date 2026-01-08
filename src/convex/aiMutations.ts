import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const storeSummary = internalMutation({
  args: {
    leadId: v.id("leads"),
    summary: v.string(),
    lastActivityHash: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if summary exists
    const existing = await ctx.db
      .query("leadSummaries")
      .withIndex("by_lead_and_hash", (q) => 
        q.eq("leadId", args.leadId).eq("lastActivityHash", args.lastActivityHash)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        summary: args.summary,
        generatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("leadSummaries", {
        leadId: args.leadId,
        summary: args.summary,
        lastActivityHash: args.lastActivityHash,
        generatedAt: Date.now(),
      });
    }
  },
});

export const getSummary = internalQuery({
  args: {
    leadId: v.id("leads"),
    lastActivityHash: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leadSummaries")
      .withIndex("by_lead_and_hash", (q) => 
        q.eq("leadId", args.leadId).eq("lastActivityHash", args.lastActivityHash)
      )
      .first();
  },
});

export const storeScore = internalMutation({
  args: {
    leadId: v.id("leads"),
    score: v.number(),
    tier: v.string(),
    rationale: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      aiScore: args.score,
      aiScoreTier: args.tier,
      aiScoreRationale: args.rationale,
      aiScoredAt: Date.now(),
    });
  },
});

export const getLeadsToScore = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .withIndex("by_last_activity", (q) => q.gte("lastActivity", args.since))
      .filter((q) => q.neq(q.field("type"), "Irrelevant"))
      .take(100); // Batch size
  },
});

export const getCommentCount = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .collect();
    return comments.length;
  },
});

export const getMessageCount = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();
    
    if (!chat) return 0;

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .collect();
    
    return messages.length;
  },
});

export const getAllLeadsForBatchProcessing = internalQuery({
  args: { 
    offset: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .filter((q) => q.neq(q.field("type"), "Irrelevant"))
      .order("asc")
      .take(args.limit);
  },
});

export const getLeadWhatsAppMessages = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();
    
    if (!chat) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("desc")
      .take(20); // Last 20 messages for context
    
    return messages.map(m => ({
      direction: m.direction,
      content: m.content,
      timestamp: m._creationTime,
    }));
  },
});

export const getLeadComments = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .take(10);
    
    return comments.map(c => c.content);
  },
});