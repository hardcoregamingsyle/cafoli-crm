import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

export const getLeadForTemplate = internalQuery({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.leadId);
  },
});

export const getTemplate = internalQuery({
  args: {
    templateId: v.id("templates"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateId);
  },
});

export const getTemplates = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("templates").collect();
  },
});