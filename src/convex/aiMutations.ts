import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Store AI summary
export const storeSummary = internalMutation({
  args: {
    leadId: v.id("leads"),
    summary: v.string(),
    lastActivityHash: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("leadSummaries")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        summary: args.summary,
        lastActivityHash: args.lastActivityHash,
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

// Get AI summary
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

// Store AI score
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

// Get leads to score
export const getLeadsToScore = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "irrelevant"),
          q.gte(q.field("lastActivity"), args.since)
        )
      )
      .take(100);
  },
});

// Get all leads for batch processing
export const getAllLeadsForBatchProcessing = internalQuery({
  args: {
    offset: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const leads = await ctx.db
      .query("leads")
      .filter((q) => q.neq(q.field("status"), "irrelevant"))
      .order("desc")
      .take(args.limit + args.offset);
    
    return leads.slice(args.offset, args.offset + args.limit);
  },
});

// Get lead WhatsApp messages
export const getLeadWhatsAppMessages = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    // Find chat for this lead
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) {
      return [];
    }

    // Get messages for this chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("desc")
      .take(20);

    return messages.map(m => ({
      direction: m.direction,
      content: m.content,
      timestamp: m._creationTime,
    }));
  },
});

// Get lead comments
export const getLeadComments = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .take(10);

    return comments.map(c => c.content || "").filter(Boolean);
  },
});

// Clear all summaries
export const clearAllSummaries = mutation({
  args: {},
  handler: async (ctx) => {
    const summaries = await ctx.db.query("leadSummaries").collect();
    for (const summary of summaries) {
      await ctx.db.delete(summary._id);
    }
    return { deleted: summaries.length };
  },
});

// Clear all scores
export const clearAllScores = mutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db
      .query("leads")
      .filter((q) => q.neq(q.field("aiScore"), undefined))
      .collect();

    for (const lead of leads) {
      await ctx.db.patch(lead._id, {
        aiScore: undefined,
        aiScoreTier: undefined,
        aiScoreRationale: undefined,
        aiScoredAt: undefined,
      });
    }
    return { cleared: leads.length };
  },
});

// Set batch process stop flag
export const setBatchProcessStop = mutation({
  args: {
    processId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("batchProcessControl")
      .withIndex("by_process_id", (q) => q.eq("processId", args.processId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        shouldStop: true,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("batchProcessControl", {
        processId: args.processId,
        shouldStop: true,
        processed: 0,
        failed: 0,
        updatedAt: Date.now(),
      });
    }
  },
});

// Check if batch process should stop
export const checkBatchProcessStop = internalQuery({
  args: {
    processId: v.string(),
  },
  handler: async (ctx, args) => {
    const control = await ctx.db
      .query("batchProcessControl")
      .withIndex("by_process_id", (q) => q.eq("processId", args.processId))
      .first();

    return control?.shouldStop || false;
  },
});

// Clear batch process stop flag
export const clearBatchProcessStop = internalMutation({
  args: {
    processId: v.string(),
  },
  handler: async (ctx, args) => {
    const control = await ctx.db
      .query("batchProcessControl")
      .withIndex("by_process_id", (q) => q.eq("processId", args.processId))
      .first();

    if (control) {
      await ctx.db.delete(control._id);
    }
  },
});

// Update batch process progress
export const updateBatchProgress = internalMutation({
  args: {
    processId: v.string(),
    processed: v.number(),
    failed: v.number(),
  },
  handler: async (ctx, args) => {
    const control = await ctx.db
      .query("batchProcessControl")
      .withIndex("by_process_id", (q) => q.eq("processId", args.processId))
      .first();

    if (control) {
      await ctx.db.patch(control._id, {
        processed: args.processed,
        failed: args.failed,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("batchProcessControl", {
        processId: args.processId,
        shouldStop: false,
        processed: args.processed,
        failed: args.failed,
        updatedAt: Date.now(),
      });
    }
  },
});

// Get batch process progress
export const getBatchProgress = query({
  args: {
    processId: v.string(),
  },
  handler: async (ctx, args) => {
    const control = await ctx.db
      .query("batchProcessControl")
      .withIndex("by_process_id", (q) => q.eq("processId", args.processId))
      .first();

    if (!control) {
      return null;
    }

    return {
      processed: control.processed,
      failed: control.failed,
      shouldStop: control.shouldStop,
    };
  },
});