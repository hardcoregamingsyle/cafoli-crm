import { v } from "convex/values";
import { query } from "../../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc } from "../../_generated/dataModel";

export const getOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
    const isAdmin = user?.role === "admin";
    const now = Date.now();
    
    let leads: Doc<"leads">[];
    if (isAdmin) {
      leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(500);
    } else {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", userId))
        .take(500);
    }
    
    return leads
      .filter((l) => l.type !== "Irrelevant" && l.nextFollowUpDate && l.nextFollowUpDate < now)
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
});

export const getCriticalOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
    const isAdmin = user?.role === "admin";
    const now = Date.now();
    
    let leads: Doc<"leads">[];
    if (isAdmin) {
      leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(500);
    } else {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", userId))
        .take(500);
    }
    
    return leads
      .filter((l) => 
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

    const user = await ctx.db.get(userId);
    const isAdmin = user?.role === "admin";
    const now = Date.now();
    
    let leads: Doc<"leads">[];
    if (isAdmin) {
      leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(500);
    } else {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_assignedTo", (q) => q.eq("assignedTo", userId))
        .take(500);
    }
    
    return leads
      .filter((l) => 
        l.type !== "Irrelevant" && 
        (l.status === "Cold" || l.type === "To be Decided") &&
        l.nextFollowUpDate && 
        l.nextFollowUpDate < now
      )
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
});