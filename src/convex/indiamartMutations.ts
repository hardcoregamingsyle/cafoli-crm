import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const checkIndiamartLeadExists = internalQuery({
  args: { uniqueQueryId: v.string() },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("indiamartUniqueId"), args.uniqueQueryId))
      .first();
    
    if (!lead) return null;

    return {
      _id: lead._id,
      type: lead.type,
    };
  },
});

export const reactivateLead = internalMutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      type: "To be Decided",
      status: "Cold",
      assignedTo: undefined,
      adminAssignmentRequired: true,
      lastActivity: Date.now(),
    });
  },
});

export const mergeIndiamartLead = internalMutation({
  args: {
    id: v.id("leads"),
    uniqueQueryId: v.string(),
    name: v.string(),
    subject: v.string(),
    mobile: v.string(),
    altMobile: v.optional(v.string()),
    email: v.string(),
    altEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    altPhone: v.optional(v.string()),
    agencyName: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    pincode: v.optional(v.string()),
    message: v.string(),
    metadata: v.object({
      queryTime: v.string(),
      queryType: v.string(),
      mcatName: v.string(),
      productName: v.string(),
      countryIso: v.string(),
      callDuration: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.id);
    if (!lead) return;

    const now = Date.now();
    const updates: any = {
      lastActivity: now,
    };

    // If assigned, bump to top of my_leads by setting nextFollowUpDate to now
    if (lead.assignedTo) {
      updates.nextFollowUpDate = now;
    }

    // Merge fields
    if (args.name) updates.name = args.name;
    if (args.mobile) updates.mobile = args.mobile;
    if (args.email) updates.email = args.email;
    if (args.agencyName) updates.agencyName = args.agencyName;
    if (args.pincode) updates.pincode = args.pincode;
    if (args.state) updates.state = args.state;
    
    // Update search text
    const merged = {
      name: updates.name || lead.name,
      subject: lead.subject,
      mobile: updates.mobile || lead.mobile,
      altMobile: lead.altMobile,
      email: updates.email || lead.email,
      altEmail: lead.altEmail,
      message: lead.message,
    };
    
    updates.searchText = [
      merged.name,
      merged.subject,
      merged.mobile,
      merged.altMobile,
      merged.email,
      merged.altEmail,
      merged.message
    ].filter(Boolean).join(" ");

    await ctx.db.patch(args.id, updates);

    // Add system comment
    await ctx.db.insert("comments", {
      leadId: args.id,
      content: `Lead reposted from IndiaMART.\nNew Message: ${args.message || "No message"}\nSubject: ${args.subject}`,
      isSystem: true,
    });
  },
});

export const createIndiamartLead = internalMutation({
  args: {
    uniqueQueryId: v.string(),
    name: v.string(),
    subject: v.string(),
    mobile: v.string(),
    altMobile: v.optional(v.string()),
    email: v.string(),
    altEmail: v.optional(v.string()),
    phone: v.optional(v.string()),
    altPhone: v.optional(v.string()),
    agencyName: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    pincode: v.optional(v.string()),
    message: v.string(),
    metadata: v.object({
      queryTime: v.string(),
      queryType: v.string(),
      mcatName: v.string(),
      productName: v.string(),
      countryIso: v.string(),
      callDuration: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const leadId = await ctx.db.insert("leads", {
      name: args.name,
      subject: args.subject,
      source: "IndiaMART",
      mobile: args.mobile,
      altMobile: args.altMobile,
      email: args.email,
      altEmail: args.altEmail,
      agencyName: args.agencyName,
      pincode: args.pincode,
      state: args.state,
      message: args.message,
      status: "Cold",
      type: "To be Decided",
      lastActivity: Date.now(),
      indiamartUniqueId: args.uniqueQueryId,
      indiamartMetadata: args.metadata,
    });
    
    // Send welcome email if email is provided
    if (args.email) {
      try {
        await ctx.scheduler.runAfter(0, internal.brevo.sendWelcomeEmail, {
          leadName: args.name,
          leadEmail: args.email,
          source: "IndiaMART",
        });
      } catch (error) {
        console.error("Failed to schedule welcome email:", error);
        // Don't throw - lead creation should succeed even if email fails
      }
    }
    
    return leadId;
  },
});