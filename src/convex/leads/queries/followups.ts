import { v } from "convex/values";
import { query } from "../../_generated/server";

export const getMyLeadsWithoutFollowUp = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assignedTo", (q) => q.eq("assignedTo", args.userId))
      .filter((q) => q.eq(q.field("nextFollowUpDate"), undefined))
      .take(200);
    
    return leads.filter(l => l.type !== "Irrelevant");
  },
});

export const getUpcomingFollowUps = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const thirtyMinutesFromNow = now + (30 * 60 * 1000);
    
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assignedTo", (q) => q.eq("assignedTo", args.userId))
      .take(300);
    
    return leads
      .filter(l => 
        l.type !== "Irrelevant" && 
        l.nextFollowUpDate && 
        l.nextFollowUpDate >= now - (1 * 60 * 1000) &&
        l.nextFollowUpDate <= thirtyMinutesFromNow
      )
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  },
});