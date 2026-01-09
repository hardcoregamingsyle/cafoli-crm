import { query } from "./_generated/server";
import { v } from "convex/values";

export const getAllGroups = query({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db
      .query("whatsappGroups")
      .order("desc")
      .collect();

    // Enrich with creator info
    const enrichedGroups = await Promise.all(
      groups.map(async (group) => {
        const creator = await ctx.db.get(group.createdBy);
        return {
          ...group,
          creatorName: creator?.name || "Unknown",
        };
      })
    );

    return enrichedGroups;
  },
});

export const getGroupsByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whatsappGroups")
      .withIndex("by_created_by", (q) => q.eq("createdBy", args.userId))
      .order("desc")
      .collect();
  },
});
