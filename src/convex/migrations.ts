import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

function generateSearchText(data: {
  name?: string;
  subject?: string;
  mobile?: string;
  altMobile?: string;
  email?: string;
  altEmail?: string;
  message?: string;
}) {
  return [
    data.name,
    data.subject,
    data.mobile,
    data.altMobile,
    data.email,
    data.altEmail,
    data.message
  ].filter(Boolean).join(" ");
}

export const backfillSearchText = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = args.numItems || 100;
    const { page, isDone, continueCursor } = await ctx.db
      .query("leads")
      .paginate({ cursor: args.cursor || null, numItems });

    let count = 0;
    for (const lead of page) {
      if (!lead.searchText) {
        const searchText = generateSearchText({
          name: lead.name,
          subject: lead.subject,
          mobile: lead.mobile,
          altMobile: lead.altMobile,
          email: lead.email,
          altEmail: lead.altEmail,
          message: lead.message,
        });
        await ctx.db.patch(lead._id, { searchText });
        count++;
      }
    }

    return {
      count,
      isDone,
      continueCursor,
    };
  },
});