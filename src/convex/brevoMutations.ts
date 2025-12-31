import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ROLES } from "./schema";

export const addBrevoApiKey = mutation({
  args: {
    adminId: v.id("users"),
    apiKey: v.string(),
    label: v.optional(v.string()),
    dailyLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can add API keys");
    }

    // Get the highest order number
    const existingKeys = await ctx.db.query("brevoApiKeys").collect();
    const maxOrder = existingKeys.length > 0 
      ? Math.max(...existingKeys.map(k => k.order)) 
      : -1;

    const keyId = await ctx.db.insert("brevoApiKeys", {
      apiKey: args.apiKey,
      label: args.label,
      isActive: true,
      dailyLimit: args.dailyLimit || 300, // Default Brevo free tier limit
      usageCount: 0,
      lastResetAt: Date.now(),
      order: maxOrder + 1,
    });

    return keyId;
  },
});

export const updateBrevoApiKey = mutation({
  args: {
    adminId: v.id("users"),
    keyId: v.id("brevoApiKeys"),
    apiKey: v.optional(v.string()),
    label: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    dailyLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can update API keys");
    }

    const updates: any = {};
    if (args.apiKey !== undefined) updates.apiKey = args.apiKey;
    if (args.label !== undefined) updates.label = args.label;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.dailyLimit !== undefined) updates.dailyLimit = args.dailyLimit;

    await ctx.db.patch(args.keyId, updates);
  },
});

export const deleteBrevoApiKey = mutation({
  args: {
    adminId: v.id("users"),
    keyId: v.id("brevoApiKeys"),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can delete API keys");
    }

    await ctx.db.delete(args.keyId);
  },
});

export const getBrevoApiKeys = query({
  args: {
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can view API keys");
    }

    const keys = await ctx.db
      .query("brevoApiKeys")
      .withIndex("by_order")
      .collect();

    return keys.sort((a, b) => a.order - b.order);
  },
});

export const resetDailyUsage = mutation({
  args: {
    keyId: v.id("brevoApiKeys"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.keyId, {
      usageCount: 0,
      lastResetAt: Date.now(),
    });
  },
});

// Internal version for use in actions
import { internalMutation } from "./_generated/server";

export const resetDailyUsageInternal = internalMutation({
  args: {
    keyId: v.id("brevoApiKeys"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.keyId, {
      usageCount: 0,
      lastResetAt: Date.now(),
    });
  },
});
