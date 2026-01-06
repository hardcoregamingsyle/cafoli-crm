import { v } from "convex/values";
import { query } from "../../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
      .collect();
    
    return leads
      .filter(l => l.type !== "Irrelevant" && l.nextFollowUpDate && l.nextFollowUpDate < now)
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
});

export const getCriticalOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
      .collect();
    
    return leads
      .filter(l => 
        l.type !== "Irrelevant" && 
        l.nextFollowUpDate && 
        l.nextFollowUpDate < now &&
        (l.status === "Hot" || l.status === "Mature")
      )
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
});

export const getColdOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
      .collect();
    
    return leads
      .filter(l => 
        l.type !== "Irrelevant" && 
        (l.status === "Cold" || l.type === "To be Decided") &&
        l.nextFollowUpDate && 
        l.nextFollowUpDate < now
      )
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
});
