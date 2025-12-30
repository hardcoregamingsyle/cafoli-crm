import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Query helpers
export const getPendingExecutions = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("campaignExecutions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lte(q.field("scheduledFor"), args.now))
      .take(50);
  },
});

export const getCampaignForExecution = internalMutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.campaignId);
  },
});

export const getLead = internalMutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.leadId);
  },
});

export const getTemplate = internalMutation({
  args: { templateId: v.id("templates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateId);
  },
});

export const markExecuting = internalMutation({
  args: { executionId: v.id("campaignExecutions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, { status: "executing" });
  },
});

export const markCompleted = internalMutation({
  args: { executionId: v.id("campaignExecutions"), result: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, { 
      status: "completed", 
      executedAt: Date.now(),
      result: args.result 
    });
  },
});

export const markFailed = internalMutation({
  args: { executionId: v.id("campaignExecutions"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.executionId, { 
      status: "failed", 
      executedAt: Date.now(),
      error: args.error 
    });
  },
});

export const scheduleExecution = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    enrollmentId: v.id("campaignEnrollments"),
    leadId: v.id("leads"),
    blockId: v.string(),
    scheduledFor: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("campaignExecutions", {
      campaignId: args.campaignId,
      enrollmentId: args.enrollmentId,
      leadId: args.leadId,
      blockId: args.blockId,
      scheduledFor: args.scheduledFor,
      status: "pending",
    });
  },
});

export const addTagToLead = internalMutation({
  args: { leadId: v.id("leads"), tagId: v.id("tags") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return;
    
    const currentTags = lead.tags || [];
    if (!currentTags.includes(args.tagId)) {
      await ctx.db.patch(args.leadId, { 
        tags: [...currentTags, args.tagId] 
      });
    }
  },
});

export const removeTagFromLead = internalMutation({
  args: { leadId: v.id("leads"), tagId: v.id("tags") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return;
    
    const currentTags = lead.tags || [];
    await ctx.db.patch(args.leadId, { 
      tags: currentTags.filter(t => t !== args.tagId) 
    });
  },
});

export const sendWhatsAppForCampaign = internalMutation({
  args: { 
    phoneNumber: v.string(),
    message: v.string(),
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    // Schedule the internal WhatsApp send action to run immediately
    await ctx.scheduler.runAfter(0, internal.whatsapp.sendWhatsAppMessageInternal, {
      phoneNumber: args.phoneNumber,
      message: args.message,
      leadId: args.leadId,
    });
  },
});