import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    if (!chat) {
      return [];
    }

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
    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const summaries = await ctx.db.query("leadSummaries").take(50);

      if (summaries.length === 0) {
        hasMore = false;
        break;
      }

      const deletePromises = summaries.map(summary => ctx.db.delete(summary._id));
      await Promise.all(deletePromises);

      totalDeleted += summaries.length;
    }

    return { deleted: totalDeleted };
  },
});

// Clear all scores
export const clearAllScores = mutation({
  args: {},
  handler: async (ctx) => {
    let totalCleared = 0;
    let hasMore = true;

    while (hasMore) {
      const leads = await ctx.db
        .query("leads")
        .filter((q) => q.neq(q.field("aiScore"), undefined))
        .take(50);

      if (leads.length === 0) {
        hasMore = false;
        break;
      }

      const patchPromises = leads.map(lead =>
        ctx.db.patch(lead._id, {
          aiScore: undefined,
          aiScoreTier: undefined,
          aiScoreRationale: undefined,
          aiScoredAt: undefined,
        })
      );
      await Promise.all(patchPromises);

      totalCleared += leads.length;
    }

    return { cleared: totalCleared };
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
      status: control.status || "running",
    };
  },
});

// Update batch process status (simplified to avoid circular deps)
export const updateBatchStatus = internalMutation({
  args: {
    processId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const control = await ctx.db
      .query("batchProcessControl")
      .withIndex("by_process_id", (q) => q.eq("processId", args.processId))
      .first();

    if (control) {
      await ctx.db.patch(control._id, {
        status: args.status,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("batchProcessControl", {
        processId: args.processId,
        shouldStop: false,
        processed: 0,
        failed: 0,
        status: args.status,
        updatedAt: Date.now(),
      });
    }
  },
});

// Start batch process in background
export const startBatchProcess = mutation({
  args: {
    processType: v.union(v.literal("summaries"), v.literal("scores"), v.literal("both")),
  },
  handler: async (ctx, args) => {
    const processId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    await ctx.db.insert("batchProcessControl", {
      processId,
      shouldStop: false,
      processed: 0,
      failed: 0,
      status: "queued",
      updatedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.aiBackground.batchProcessLeadsBackground, {
      processType: args.processType,
      processId,
    });

    return { processId };
  },
});

// Internal queries and mutations for aiBackground to use
export const getBatchControlInternal = internalQuery({
  args: { processId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("batchProcessControl")
      .withIndex("by_process_id", (q) => q.eq("processId", args.processId))
      .first();
  },
});

export const getLeadsForBatchInternal = internalQuery({
  args: { offset: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    const allLeads = await ctx.db
      .query("leads")
      .filter((q) => q.neq(q.field("status"), "irrelevant"))
      .order("desc")
      .take(args.limit + args.offset);
    return allLeads.slice(args.offset, args.offset + args.limit);
  },
});

export const getWhatsAppMessagesInternal = internalQuery({
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
      .take(20);
    return messages.map((m) => ({
      direction: m.direction,
      content: m.content,
      timestamp: m._creationTime,
    }));
  },
});

export const getCommentsInternal = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const cmts = await ctx.db
      .query("comments")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .take(10);
    return cmts.map((c) => c.content || "").filter(Boolean);
  },
});

export const storeSummaryInternal = internalMutation({
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

export const getSummaryInternal = internalQuery({
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

export const storeScoreInternal = internalMutation({
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

export const updateBatchProgressInternal = internalMutation({
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
    }
  },
});

export const deleteBatchControlInternal = internalMutation({
  args: { processId: v.string() },
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