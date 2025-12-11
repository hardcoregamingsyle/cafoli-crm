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
    
    return lead !== null;
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