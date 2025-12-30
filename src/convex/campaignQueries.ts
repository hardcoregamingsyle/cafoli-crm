import { v } from "convex/values";
import { query } from "./_generated/server";
import { ROLES } from "./schema";

export const getCampaigns = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return [];

    const isAdmin = user.role === ROLES.ADMIN;

    if (isAdmin) {
      return await ctx.db.query("campaigns").order("desc").collect();
    } else {
      return await ctx.db.query("campaigns")
        .withIndex("by_created_by", (q) => q.eq("createdBy", args.userId))
        .order("desc")
        .collect();
    }
  },
});

export const getCampaign = query({
  args: { campaignId: v.id("campaigns"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    return await ctx.db.get(args.campaignId);
  },
});

export const getCampaignEnrollments = query({
  args: { campaignId: v.id("campaigns"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return [];

    return await ctx.db.query("campaignEnrollments")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
  },
});
