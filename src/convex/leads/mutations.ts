import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";

export const logExport = mutation({
  args: {
    userId: v.id("users"),
    downloadNumber: v.number(),
    fileName: v.string(),
    leadCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("exportLogs", {
      userId: args.userId,
      downloadNumber: args.downloadNumber,
      fileName: args.fileName,
      leadCount: args.leadCount,
      timestamp: Date.now(),
      exportedAt: Date.now(),
    });
  },
});

export const updateSourcesCache = internalMutation({
  args: { source: v.string() },
  handler: async (ctx, args) => {
    if (!args.source) return;
    const cache = await ctx.db.query("leadSourcesCache").first();
    if (cache) {
      if (!cache.sources.includes(args.source)) {
        await ctx.db.patch(cache._id, {
          sources: [...cache.sources, args.source].sort(),
          updatedAt: Date.now(),
        });
      }
    } else {
      await ctx.db.insert("leadSourcesCache", {
        key: "singleton",
        sources: [args.source],
        updatedAt: Date.now(),
      });
    }
  },
});