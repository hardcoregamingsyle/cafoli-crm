import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Get all keys (for admin UI)
export const getGeminiApiKeys = query({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }
    return await ctx.db.query("geminiApiKeys").collect();
  },
});

// Get active keys (internal use)
export const getActiveKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("geminiApiKeys")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

// Add a new key
export const addGeminiApiKey = mutation({
  args: {
    adminId: v.id("users"),
    apiKey: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.insert("geminiApiKeys", {
      apiKey: args.apiKey,
      label: args.label,
      isActive: true,
      usageCount: 0,
      lastResetAt: Date.now(),
    });
  },
});

// Update key status
export const updateGeminiApiKey = mutation({
  args: {
    adminId: v.id("users"),
    keyId: v.id("geminiApiKeys"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.keyId, {
      isActive: args.isActive,
    });
  },
});

// Delete key
export const deleteGeminiApiKey = mutation({
  args: {
    adminId: v.id("users"),
    keyId: v.id("geminiApiKeys"),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.keyId);
  },
});

// Internal: Increment usage
export const incrementUsage = internalMutation({
  args: { keyId: v.id("geminiApiKeys") },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (key) {
      await ctx.db.patch(args.keyId, {
        usageCount: key.usageCount + 1,
        lastUsedAt: Date.now(),
      });
    }
  },
});

// Internal: Reset daily usage
export const resetDailyUsageInternal = internalMutation({
  args: { keyId: v.id("geminiApiKeys") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.keyId, {
      usageCount: 0,
      lastResetAt: Date.now(),
    });
  },
});