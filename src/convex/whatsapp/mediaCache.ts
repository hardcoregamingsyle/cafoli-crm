import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const get = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whatsappMediaCache")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
  },
});

export const save = internalMutation({
  args: {
    storageId: v.id("_storage"),
    mediaId: v.string(),
    mimeType: v.string(),
    fileName: v.optional(v.string()),
    displayUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappMediaCache")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        mediaId: args.mediaId,
        mimeType: args.mimeType,
        displayUrl: args.displayUrl,
      });
    } else {
      await ctx.db.insert("whatsappMediaCache", {
        storageId: args.storageId,
        mediaId: args.mediaId,
        mimeType: args.mimeType,
        displayUrl: args.displayUrl,
      });
    }
  },
});

export const remove = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappMediaCache")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});