import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ROLES } from "../schema";
import { standardizePhoneNumber, generateSearchText, handleFollowUpChange } from "../leadUtils";

export const createLead = mutation({
  args: {
    name: v.string(),
    subject: v.string(),
    source: v.string(),
    mobile: v.string(),
    altMobile: v.optional(v.string()),
    email: v.optional(v.string()),
    agencyName: v.optional(v.string()),
    message: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");

    const mobile = standardizePhoneNumber(args.mobile);

    const searchText = generateSearchText({
      name: args.name,
      subject: args.subject,
      mobile: mobile,
      email: args.email,
      message: args.message,
    });

    const leadId = await ctx.db.insert("leads", {
      name: args.name,
      subject: args.subject,
      source: args.source,
      mobile: mobile,
      email: args.email,
      agencyName: args.agencyName,
      message: args.message,
      status: "Cold",
      type: "To be Decided",
      lastActivity: Date.now(),
      searchText,
    });
    
    if (args.email) {
      try {
        await ctx.scheduler.runAfter(0, "brevo:sendWelcomeEmail" as any, {
          leadName: args.name,
          leadEmail: args.email,
          source: args.source,
        });
      } catch (error) {
        console.error("Failed to schedule welcome email:", error);
      }
    }
    
    // Send welcome WhatsApp message to primary mobile
    try {
      await ctx.scheduler.runAfter(0, "whatsappTemplates:sendWelcomeMessage" as any, {
        phoneNumber: mobile,
        leadId: leadId,
      });
    } catch (error) {
      console.error("Failed to schedule welcome WhatsApp template to primary mobile:", error);
    }
    
    // Send welcome WhatsApp message to alternate mobile if exists
    if (args.altMobile) {
      const altMobile = standardizePhoneNumber(args.altMobile);
      try {
        await ctx.scheduler.runAfter(0, "whatsappTemplates:sendWelcomeMessage" as any, {
          phoneNumber: altMobile,
          leadId: leadId,
        });
      } catch (error) {
        console.error("Failed to schedule welcome WhatsApp template to alternate mobile:", error);
      }
    }
    
    return leadId;
  },
});

export const updateLead = mutation({
  args: {
    id: v.id("leads"),
    patch: v.object({
      status: v.optional(v.string()),
      type: v.optional(v.string()),
      assignedTo: v.optional(v.id("users")),
      nextFollowUpDate: v.optional(v.number()),
      message: v.optional(v.string()),
      comments: v.optional(v.string()), 
      name: v.optional(v.string()),
      mobile: v.optional(v.string()),
      email: v.optional(v.string()),
      agencyName: v.optional(v.string()),
      pincode: v.optional(v.string()),
      state: v.optional(v.string()),
      district: v.optional(v.string()),
      station: v.optional(v.string()),
      tags: v.optional(v.array(v.id("tags"))),
    }),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");
    
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new Error("Lead not found");

    // Validate tags array length (maximum 8 tags)
    if (args.patch.tags !== undefined && args.patch.tags.length > 8) {
      throw new Error("A lead cannot have more than 8 tags");
    }

    let newType = args.patch.type;
    const newStatus = args.patch.status || lead.status;
    const currentType = args.patch.type || lead.type;

    if ((newStatus === "Hot" || newStatus === "Mature") && currentType === "To be Decided") {
      newType = "Relevant";
    }

    // Validate follow-up date constraints
    if (args.patch.nextFollowUpDate !== undefined) {
      const followUpDate = args.patch.nextFollowUpDate;
      const now = Date.now();
      const maxFutureDate = now + (31 * 24 * 60 * 60 * 1000);

      if (followUpDate <= now) {
        throw new Error("Follow-up date must be in the future");
      }

      if (followUpDate > maxFutureDate) {
        throw new Error("Follow-up date cannot be more than 31 days in the future");
      }

      const assignee = args.patch.assignedTo || lead.assignedTo || userId;
      await handleFollowUpChange(ctx, args.id, followUpDate, assignee);
    }

    const isAssigned = args.patch.assignedTo !== undefined ? args.patch.assignedTo : lead.assignedTo;
    if (isAssigned) {
      const hasFollowUpDate = args.patch.nextFollowUpDate !== undefined ? args.patch.nextFollowUpDate : lead.nextFollowUpDate;
      if (!hasFollowUpDate) {
        throw new Error("Follow-up date is required for assigned leads");
      }
    }

    let mobile = lead.mobile;
    if (args.patch.mobile) {
      mobile = standardizePhoneNumber(args.patch.mobile);
    }

    const merged = {
      name: args.patch.name ?? lead.name,
      subject: lead.subject,
      mobile: mobile,
      altMobile: lead.altMobile,
      email: args.patch.email ?? lead.email,
      altEmail: lead.altEmail,
      message: args.patch.message ?? lead.message,
    };
    const searchText = generateSearchText(merged);

    const patchUpdates = { ...args.patch };
    if (patchUpdates.mobile) {
      patchUpdates.mobile = mobile;
    }
    
    if (newType !== args.patch.type) {
      patchUpdates.type = newType;
    }

    await ctx.db.patch(args.id, {
      ...patchUpdates,
      searchText,
      lastActivity: Date.now(),
    });
  },
});

export const assignLead = mutation({
  args: {
    leadId: v.id("leads"),
    userId: v.id("users"),
    adminId: v.id("users"),
    nextFollowUpDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUserId = args.adminId;
    if (!currentUserId) throw new Error("Unauthorized");
    
    const currentUser = await ctx.db.get(currentUserId);
    const lead = await ctx.db.get(args.leadId);
    
    if (!lead) throw new Error("Lead not found");
    
    if (lead.adminAssignmentRequired && currentUser?.role !== ROLES.ADMIN) {
      throw new Error("This lead can only be assigned by an admin");
    }

    if (currentUser?.role === ROLES.STAFF && args.userId !== currentUserId) {
      throw new Error("Staff can only assign leads to themselves");
    }
    
    if (!args.nextFollowUpDate) {
      throw new Error("Follow-up date is required when assigning a lead");
    }
    
    const followUpDate = args.nextFollowUpDate;
    const now = Date.now();
    const maxFutureDate = now + (31 * 24 * 60 * 60 * 1000);

    if (followUpDate <= now) {
      throw new Error("Follow-up date must be in the future");
    }

    if (followUpDate > maxFutureDate) {
      throw new Error("Follow-up date cannot be more than 31 days in the future");
    }
    
    await handleFollowUpChange(ctx, args.leadId, followUpDate, args.userId);

    await ctx.db.patch(args.leadId, {
      assignedTo: args.userId,
      nextFollowUpDate: args.nextFollowUpDate,
      lastActivity: Date.now(),
      adminAssignmentRequired: undefined, 
    });
  },
});

export const addComment = mutation({
  args: {
    leadId: v.id("leads"),
    content: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.insert("comments", {
      leadId: args.leadId,
      userId,
      content: args.content,
    });

    await ctx.db.patch(args.leadId, {
      lastActivity: Date.now(),
    });
  },
});