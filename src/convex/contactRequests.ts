import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createContactRequest = mutation({
  args: {
    leadId: v.id("leads"),
    assignedTo: v.id("users"),
    customerMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const requestId = await ctx.db.insert("contactRequests", {
      leadId: args.leadId,
      assignedTo: args.assignedTo,
      customerMessage: args.customerMessage,
      status: "pending",
    });
    return requestId;
  },
});

export const getPendingContactRequests = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("contactRequests")
      .withIndex("by_assignedTo_and_status", (q) =>
        q.eq("assignedTo", args.userId).eq("status", "pending")
      )
      .collect();

    const requestsWithLeads = await Promise.all(
      requests.map(async (request) => {
        const lead = await ctx.db.get(request.leadId);
        return {
          ...request,
          lead,
        };
      })
    );

    return requestsWithLeads;
  },
});

export const acknowledgeContactRequest = mutation({
  args: {
    requestId: v.id("contactRequests"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: "acknowledged",
      acknowledgedAt: Date.now(),
    });
  },
});

export const completeContactRequest = mutation({
  args: {
    requestId: v.id("contactRequests"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: "completed",
    });
  },
});
