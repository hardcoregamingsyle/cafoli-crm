import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createQuickReply = mutation({
  args: {
    name: v.string(),
    message: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const quickReplyId = await ctx.db.insert("quickReplies", {
      name: args.name,
      message: args.message,
      category: args.category || "General",
      usageCount: 0,
    });
    return quickReplyId;
  },
});

export const listQuickReplies = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("quickReplies").order("desc").collect();
  },
});

export const updateQuickReply = mutation({
  args: {
    id: v.id("quickReplies"),
    name: v.string(),
    message: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
      message: args.message,
      category: args.category,
    });
  },
});

export const deleteQuickReply = mutation({
  args: {
    id: v.id("quickReplies"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const incrementUsage = mutation({
  args: {
    id: v.id("quickReplies"),
  },
  handler: async (ctx, args) => {
    const quickReply = await ctx.db.get(args.id);
    if (quickReply) {
      await ctx.db.patch(args.id, {
        usageCount: quickReply.usageCount + 1,
      });
    }
  },
});
