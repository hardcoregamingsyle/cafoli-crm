import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { ROLES } from "./schema";

export const createCampaign = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
    leadSelection: v.object({
      type: v.union(v.literal("all"), v.literal("filtered")),
      tagIds: v.optional(v.array(v.id("tags"))),
      statuses: v.optional(v.array(v.string())),
      sources: v.optional(v.array(v.string())),
      autoEnrollNew: v.optional(v.boolean()),
    }),
    blocks: v.array(v.object({
      id: v.string(),
      type: v.string(),
      data: v.any(),
      position: v.optional(v.object({ x: v.number(), y: v.number() })),
    })),
    connections: v.array(v.object({
      from: v.string(),
      to: v.string(),
      label: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const campaignId = await ctx.db.insert("campaigns", {
      name: args.name,
      description: args.description,
      type: args.type,
      status: "draft",
      createdBy: args.userId,
      leadSelection: args.leadSelection,
      blocks: args.blocks,
      connections: args.connections,
      metrics: {
        enrolled: 0,
        completed: 0,
        active: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
      },
    });

    return campaignId;
  },
});

export const updateCampaign = mutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    leadSelection: v.optional(v.object({
      type: v.union(v.literal("all"), v.literal("filtered")),
      tagIds: v.optional(v.array(v.id("tags"))),
      statuses: v.optional(v.array(v.string())),
      sources: v.optional(v.array(v.string())),
      autoEnrollNew: v.optional(v.boolean()),
    })),
    blocks: v.optional(v.array(v.object({
      id: v.string(),
      type: v.string(),
      data: v.any(),
      position: v.optional(v.object({ x: v.number(), y: v.number() })),
    }))),
    connections: v.optional(v.array(v.object({
      from: v.string(),
      to: v.string(),
      label: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");

    if (campaign.status !== "draft") {
      throw new Error("Can only edit draft campaigns");
    }

    const updates: any = {};
    if (args.name) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.leadSelection) updates.leadSelection = args.leadSelection;
    if (args.blocks) updates.blocks = args.blocks;
    if (args.connections) updates.connections = args.connections;

    await ctx.db.patch(args.campaignId, updates);
  },
});

export const activateCampaign = mutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");

    if (campaign.status !== "draft" && campaign.status !== "paused") {
      throw new Error("Can only activate draft or paused campaigns");
    }

    // Validate campaign has blocks
    if (!campaign.blocks || campaign.blocks.length === 0) {
      throw new Error("Campaign must have at least one block");
    }

    await ctx.db.patch(args.campaignId, { status: "active" });

    // Enroll eligible leads
    const isAdmin = user?.role === ROLES.ADMIN;

    let leads;
    if (campaign.leadSelection.type === "all") {
      if (isAdmin) {
        leads = await ctx.db.query("leads").collect();
      } else {
        leads = await ctx.db.query("leads")
          .withIndex("by_assigned_to", (q) => q.eq("assignedTo", args.userId))
          .collect();
      }
    } else {
      // Filtered leads
      leads = await ctx.db.query("leads").collect();
      
      if (!isAdmin) {
        leads = leads.filter(l => l.assignedTo === args.userId);
      }

      // Apply filters
      if (campaign.leadSelection.tagIds && campaign.leadSelection.tagIds.length > 0) {
        leads = leads.filter(l => 
          l.tags && campaign.leadSelection.tagIds!.some(tagId => l.tags!.includes(tagId))
        );
      }

      if (campaign.leadSelection.statuses && campaign.leadSelection.statuses.length > 0) {
        leads = leads.filter(l => 
          l.status && campaign.leadSelection.statuses!.includes(l.status)
        );
      }

      if (campaign.leadSelection.sources && campaign.leadSelection.sources.length > 0) {
        leads = leads.filter(l => 
          l.source && campaign.leadSelection.sources!.includes(l.source)
        );
      }
    }

    // Enroll leads
    const now = Date.now();
    for (const lead of leads) {
      const enrollmentId = await ctx.db.insert("campaignEnrollments", {
        campaignId: args.campaignId,
        leadId: lead._id,
        status: "active",
        currentBlockId: campaign.blocks[0].id,
        enrolledAt: now,
        pathTaken: [],
      });

      // Schedule the first block execution immediately
      await ctx.db.insert("campaignExecutions", {
        campaignId: args.campaignId,
        enrollmentId: enrollmentId,
        leadId: lead._id,
        blockId: campaign.blocks[0].id,
        scheduledFor: now, // Execute immediately
        status: "pending",
      });
    }

    // Update metrics
    await ctx.db.patch(args.campaignId, {
      metrics: {
        ...campaign.metrics!,
        enrolled: leads.length,
        active: leads.length,
      },
    });

    return { enrolled: leads.length };
  },
});

export const pauseCampaign = mutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(args.campaignId, { status: "paused" });
  },
});

export const deleteCampaign = mutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new Error("Campaign not found");

    if (campaign.status === "active") {
      throw new Error("Cannot delete active campaign. Pause it first.");
    }

    await ctx.db.delete(args.campaignId);
  },
});