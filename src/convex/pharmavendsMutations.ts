import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const checkLeadExists = internalQuery({
  args: { uid: v.string() },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("pharmavendsUid"), args.uid))
      .first();
    
    return lead !== null;
  },
});

export const createPharmavendsLead = internalMutation({
  args: {
    uid: v.string(),
    name: v.string(),
    subject: v.string(),
    mobile: v.string(),
    altMobile: v.optional(v.string()),
    email: v.string(),
    agencyName: v.optional(v.string()),
    pincode: v.string(),
    state: v.string(),
    station: v.string(),
    message: v.string(),
    metadata: v.object({
      gstNo: v.string(),
      drugLicence: v.string(),
      receivedOn: v.string(),
      requirementType: v.string(),
      timeToCall: v.string(),
      profession: v.string(),
      experience: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const leadId = await ctx.db.insert("leads", {
      name: args.name,
      subject: args.subject,
      source: "Pharmavends",
      mobile: args.mobile,
      altMobile: args.altMobile,
      email: args.email,
      agencyName: args.agencyName,
      pincode: args.pincode,
      state: args.state,
      station: args.station,
      message: args.message,
      status: "Cold",
      type: "To be Decided",
      lastActivity: Date.now(),
      pharmavendsUid: args.uid,
      pharmavendsMetadata: args.metadata,
    });
    
    return leadId;
  },
});
