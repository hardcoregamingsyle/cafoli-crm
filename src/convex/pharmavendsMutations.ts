import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const checkLeadExists = internalQuery({
  args: { 
    uid: v.string(),
    mobile: v.string(),
  },
  handler: async (ctx, args) => {
    // First check by mobile number (primary deduplication)
    const leadByMobile = await ctx.db
      .query("leads")
      .withIndex("by_mobile", (q) => q.eq("mobile", args.mobile))
      .first();
    
    if (leadByMobile) {
      return {
        _id: leadByMobile._id,
        type: leadByMobile.type,
      };
    }

    // Fallback: check by UID (for legacy data)
    const leadByUid = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("pharmavendsUid"), args.uid))
      .first();
    
    if (!leadByUid) return null;

    return {
      _id: leadByUid._id,
      type: leadByUid.type,
    };
  },
});

export const reactivateLead = internalMutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      type: "To be Decided",
      status: "Cold", // Reset status to Cold
      assignedTo: undefined, // Ensure it is unassigned
      adminAssignmentRequired: true,
      lastActivity: Date.now(),
    });
  },
});

export const mergePharmavendsLead = internalMutation({
  args: {
    id: v.id("leads"),
    uid: v.string(),
    name: v.string(),
    subject: v.string(),
    mobile: v.string(),
    altMobile: v.optional(v.string()),
    email: v.optional(v.string()),
    altEmail: v.optional(v.string()),
    agencyName: v.optional(v.string()),
    pincode: v.optional(v.string()),
    state: v.optional(v.string()),
    district: v.optional(v.string()),
    station: v.optional(v.string()),
    message: v.optional(v.string()),
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

    // Merge fields - overwrite if new data is present
    if (args.name) updates.name = args.name;
    if (args.mobile) updates.mobile = args.mobile;
    if (args.email) updates.email = args.email;
    if (args.agencyName) updates.agencyName = args.agencyName;
    if (args.pincode) updates.pincode = args.pincode;
    if (args.state) updates.state = args.state;
    if (args.district) updates.district = args.district;
    if (args.station) updates.station = args.station;
    
    // Don't overwrite message, but maybe we should? 
    // Let's keep the old message in the lead but add the new message to the system comment
    // updates.message = args.message; 

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
      content: `Lead reposted from Pharmavends.\nNew Message: ${args.message || "No message"}\nSubject: ${args.subject}`,
      isSystem: true,
    });
  },
});

export const createPharmavendsLead = internalMutation({
  args: {
    uid: v.string(),
    name: v.string(),
    subject: v.string(),
    mobile: v.string(),
    altMobile: v.optional(v.string()),
    email: v.optional(v.string()),
    altEmail: v.optional(v.string()),
    agencyName: v.optional(v.string()),
    pincode: v.optional(v.string()),
    state: v.optional(v.string()),
    district: v.optional(v.string()),
    station: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Generate search text
    const searchText = [
      args.name,
      args.subject,
      args.mobile,
      args.altMobile,
      args.email,
      args.altEmail,
      args.message
    ].filter(Boolean).join(" ");

    const leadId = await ctx.db.insert("leads", {
      name: args.name,
      subject: args.subject,
      source: "Website and Pharmavends",
      mobile: args.mobile,
      altMobile: args.altMobile,
      email: args.email,
      altEmail: args.altEmail,
      agencyName: args.agencyName,
      pincode: args.pincode,
      state: args.state,
      district: args.district,
      station: args.station,
      message: args.message,
      status: "Cold",
      type: "To be Decided",
      lastActivity: Date.now(),
      pharmavendsUid: args.uid,
      searchText,
    });
    
    // Send welcome email
    if (args.email) {
      try {
        await ctx.scheduler.runAfter(0, internal.brevo.sendWelcomeEmail, {
          leadName: args.name,
          leadEmail: args.email,
          source: "Website and Pharmavends",
        });
      } catch (error) {
        console.error("Failed to schedule welcome email:", error);
        // Don't throw - lead creation should succeed even if email fails
      }
    }
    
    return leadId;
  },
});