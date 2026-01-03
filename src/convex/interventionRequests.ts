import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createInterventionRequest = mutation({
  args: {
    leadId: v.id("leads"),
    assignedTo: v.id("users"),
    requestedProduct: v.string(),
    customerMessage: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("interventionRequests", {
      leadId: args.leadId,
      assignedTo: args.assignedTo,
      requestedProduct: args.requestedProduct,
      customerMessage: args.customerMessage,
      status: "pending",
    });
  },
});

export const getPendingInterventions = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const interventions = await ctx.db
      .query("interventionRequests")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", args.userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    // Enrich with lead data
    const enriched = await Promise.all(
      interventions.map(async (intervention) => {
        const lead = await ctx.db.get(intervention.leadId);
        return {
          ...intervention,
          lead,
        };
      })
    );

    return enriched;
  },
});

export const resolveIntervention = mutation({
  args: {
    interventionId: v.id("interventionRequests"),
    status: v.union(v.literal("resolved"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.interventionId, {
      status: args.status,
      resolvedAt: Date.now(),
    });
  },
});
