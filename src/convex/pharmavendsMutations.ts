import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Add phone number standardization utility at the top after imports
function standardizePhoneNumber(phone: string): string {
  if (!phone) return "";
  
  // Remove all non-digit characters and spaces
  const cleaned = phone.replace(/\D/g, "");
  
  // If 10 digits, prepend '91'
  if (cleaned.length === 10) {
    return "91" + cleaned;
  }
  
  // If 11+ digits, return as-is
  return cleaned;
}

export const checkLeadExists = internalQuery({
  args: { 
    uid: v.string(),
    mobile: v.string(),
  },
  handler: async (ctx, args) => {
    // Standardize the mobile number before checking
    const standardizedMobile = standardizePhoneNumber(args.mobile);
    
    // First check by mobile number (primary deduplication)
    const leadByMobile = await ctx.db
      .query("leads")
      .withIndex("by_mobile", (q) => q.eq("mobile", standardizedMobile))
      .first();
    
    if (leadByMobile) {
      return {
        _id: leadByMobile._id,
        type: leadByMobile.type,
      };
    }

    // Also check R2 by mobile
    const r2Lead = await ctx.db
      .query("r2_leads_mock")
      .withIndex("by_mobile", (q) => q.eq("mobile", standardizedMobile))
      .first();

    if (r2Lead) {
      return {
        _id: r2Lead._id,
        type: (r2Lead.leadData?.lead?.type) || "To be Decided",
        isR2: true,
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
    // Validate mobile before merging
    const standardizedMobile = standardizePhoneNumber(args.mobile);
    if (!standardizedMobile || standardizedMobile.length < 10) {
      console.warn(`Skipping merge for lead with invalid mobile: uid=${args.uid}, mobile="${args.mobile}"`);
      return;
    }

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

    const standardizedAltMobile = args.altMobile ? standardizePhoneNumber(args.altMobile) : undefined;

    // Merge fields - overwrite if new data is present
    if (args.name && args.name.trim() !== "" && args.name.trim() !== "*") updates.name = args.name;
    if (standardizedMobile) updates.mobile = standardizedMobile;
    if (args.email) updates.email = args.email;
    if (standardizedAltMobile) updates.altMobile = standardizedAltMobile;
    if (args.agencyName) updates.agencyName = args.agencyName;
    if (args.pincode) updates.pincode = args.pincode;
    if (args.state) updates.state = args.state;
    if (args.district) updates.district = args.district;
    if (args.station) updates.station = args.station;

    // Update search text
    const merged = {
      name: updates.name || lead.name,
      subject: lead.subject,
      mobile: updates.mobile || lead.mobile,
      altMobile: updates.altMobile || lead.altMobile,
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
      content: `Lead reposted from Pharmavends.\\nNew Message: ${args.message || "No message"}\\nSubject: ${args.subject}`,
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
    // Standardize phone numbers before creating
    const standardizedMobile = standardizePhoneNumber(args.mobile);
    const standardizedAltMobile = args.altMobile ? standardizePhoneNumber(args.altMobile) : undefined;

    // Skip leads with invalid mobile numbers or junk names
    if (!standardizedMobile || standardizedMobile.length < 10) {
      console.warn(`Skipping lead with invalid mobile: uid=${args.uid}, mobile="${args.mobile}", name="${args.name}"`);
      return null;
    }
    if (!args.name || args.name.trim() === "" || args.name.trim() === "*") {
      console.warn(`Skipping lead with invalid name: uid=${args.uid}, name="${args.name}"`);
      return null;
    }

    // Generate search text
    const searchText = [
      args.name,
      args.subject,
      standardizedMobile,
      standardizedAltMobile,
      args.email,
      args.altEmail,
      args.message
    ].filter(Boolean).join(" ");

    // NEW LEADS GO DIRECTLY TO R2 (cold storage) to keep Convex lean
    // They will be restored to Convex only when a user opens them or a WhatsApp message arrives
    const leadData = {
      name: args.name,
      subject: args.subject,
      source: "Website and Pharmavends",
      mobile: standardizedMobile,
      altMobile: standardizedAltMobile,
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
    };

    await ctx.db.insert("r2_leads_mock", {
      originalId: `pharmavends_${args.uid}`,
      leadData: { lead: leadData },
      mobile: standardizedMobile,
      name: args.name,
      searchText,
      status: "Cold",
      source: "Website and Pharmavends",
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
      }
    }

    // NOTE: Welcome WhatsApp is NOT sent here because we don't have a leadId yet.
    // When the lead replies to any future message, processWhatsAppLead will restore them from R2.
    // If you want to send a welcome template, restore the lead first, then send.

    return null; // R2 leads don't have a Convex leadId yet
  },
});