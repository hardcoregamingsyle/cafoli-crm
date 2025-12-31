import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

export const getActiveKeys = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"brevoApiKeys">[]> => {
    const keys = await ctx.db
      .query("brevoApiKeys")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return keys.sort((a, b) => a.order - b.order);
  },
});

export const incrementUsage = internalMutation({
  args: {
    keyId: v.id("brevoApiKeys"),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (!key) return;

    await ctx.db.patch(args.keyId, {
      usageCount: key.usageCount + 1,
      lastUsedAt: Date.now(),
    });
  },
});