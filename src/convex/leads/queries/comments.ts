import { v } from "convex/values";
import { query } from "../../_generated/server";

export const getComments = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .collect();

    const commentsWithUser = await Promise.all(
      comments.map(async (c) => {
        let userName = "System";
        let userImage = undefined;

        if (c.userId) {
          const user = await ctx.db.get(c.userId);
          userName = user?.name || "Unknown";
          userImage = user?.image;
        } else if (c.isSystem) {
          userName = "System";
        }

        return { ...c, userName, userImage };
      })
    );

    return commentsWithUser;
  },
});
