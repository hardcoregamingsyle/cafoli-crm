import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

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
