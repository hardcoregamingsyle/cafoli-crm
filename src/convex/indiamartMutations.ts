import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { restoreLeadFromR2Core } from "./r2_cache_prototype";
import { Id } from "./_generated/dataModel";

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

export const processIndiamartLead = internalMutation({
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
    // Validate name and mobile before processing
    const standardizedMobile = standardizePhoneNumber(args.mobile);
    if (!standardizedMobile || standardizedMobile.length < 10) {
      console.warn(`Skipping IndiaMART lead with invalid mobile: id=${args.uniqueQueryId}, mobile="${args.mobile}", name="${args.name}"`);
      return { status: "skipped", reason: "invalid_mobile" };
    }
    if (!args.name || args.name.trim() === "" || args.name.trim() === "*") {
      console.warn(`Skipping IndiaMART lead with invalid name: id=${args.uniqueQueryId}, name="${args.name}"`);
      return { status: "skipped", reason: "invalid_name" };
    }

    // First check by mobile number (primary deduplication)
    let existingLead = null;
    if (standardizedMobile) {
      existingLead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", standardizedMobile))
        .first();
    }
    
    if (!existingLead && args.uniqueQueryId) {
      // Fallback: check by unique query ID (for legacy data)
      existingLead = await ctx.db
        .query("leads")
        .withIndex("by_indiamart_id", (q) => q.eq("indiamartUniqueId", args.uniqueQueryId))
        .first();
    }

    if (!existingLead) {
      // Check R2
      let r2Lead = null;
      if (standardizedMobile) {
        r2Lead = await ctx.db
          .query("r2_leads_mock")
          .withIndex("by_mobile", (q) => q.eq("mobile", standardizedMobile))
          .first();
      }
      
      if (!r2Lead && args.uniqueQueryId) {
        r2Lead = await ctx.db
          .query("r2_leads_mock")
          .withIndex("by_indiamart_id", (q) => q.eq("indiamartUniqueId", args.uniqueQueryId))
          .first();
      }
      
      if (r2Lead) {
        const restoredLeadId = await restoreLeadFromR2Core(ctx, r2Lead._id);
        if (restoredLeadId) {
          existingLead = await ctx.db.get(restoredLeadId as Id<"leads">);
        }
      }
    }

    if (existingLead) {
      if (existingLead.type === "Irrelevant") {
        await ctx.db.patch(existingLead._id, {
          type: "To be Decided",
          status: "Cold",
          assignedTo: undefined,
          adminAssignmentRequired: true,
          lastActivity: Date.now(),
        });
        return { status: "reactivated", id: existingLead._id };
      }

      // Merge logic
      const now = Date.now();
      const updates: any = {
        lastActivity: now,
      };

      // If assigned, bump to top of my_leads by setting nextFollowUpDate to now
      if (existingLead.assignedTo) {
        updates.nextFollowUpDate = now;
        
        // Also update follow-up history
        const pending = await ctx.db
          .query("followups")
          .withIndex("by_lead", (q) => q.eq("leadId", existingLead._id))
          .filter((q) => q.eq(q.field("status"), "pending"))
          .collect();

        for (const followup of pending) {
          const isOverdue = now > (followup.scheduledAt + 20 * 60 * 1000);
          await ctx.db.patch(followup._id, {
            status: "completed",
            completedAt: now,
            completionStatus: isOverdue ? "overdue" : "timely",
          });
        }
        
        // Create new follow-up for "now" (immediate attention)
        await ctx.db.insert("followups", {
          leadId: existingLead._id,
          userId: existingLead.assignedTo,
          assignedTo: existingLead.assignedTo,
          scheduledAt: now,
          status: "pending",
        });
      }

      const standardizedAltMobile = args.altMobile ? standardizePhoneNumber(args.altMobile) : undefined;

      // Merge fields
      if (args.name) updates.name = args.name;
      if (standardizedMobile) updates.mobile = standardizedMobile;
      if (args.email) updates.email = args.email;
      if (standardizedAltMobile) updates.altMobile = standardizedAltMobile;
      if (args.agencyName) updates.agencyName = args.agencyName;
      if (args.pincode) updates.pincode = args.pincode;
      if (args.state) updates.state = args.state;
      
      // Update search text
      const merged = {
        name: updates.name || existingLead.name,
        subject: existingLead.subject,
        mobile: updates.mobile || existingLead.mobile,
        altMobile: updates.altMobile || existingLead.altMobile,
        email: updates.email || existingLead.email,
        altEmail: existingLead.altEmail,
        message: existingLead.message,
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

      await ctx.db.patch(existingLead._id, updates);

      // Add system comment
      await ctx.db.insert("comments", {
        leadId: existingLead._id,
        content: `Lead reposted from IndiaMART.\nNew Message: ${args.message || "No message"}\nSubject: ${args.subject}`,
        isSystem: true,
      });

      return { status: "merged", id: existingLead._id };
    }

    // Create logic
    const standardizedAltMobile = args.altMobile ? standardizePhoneNumber(args.altMobile) : undefined;

    const leadId = await ctx.db.insert("leads", {
      name: args.name,
      subject: args.subject,
      source: "IndiaMART",
      mobile: standardizedMobile,
      altMobile: standardizedAltMobile,
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
      }
    }
    
    // Send welcome WhatsApp message to primary mobile
    try {
      await ctx.scheduler.runAfter(0, internal.whatsappTemplates.sendWelcomeMessage, {
        phoneNumber: standardizedMobile,
        leadId: leadId,
      });
    } catch (error) {
      console.error("Failed to schedule welcome WhatsApp template to primary mobile:", error);
    }
    
    // Send welcome WhatsApp message to alternate mobile if exists
    if (standardizedAltMobile) {
      try {
        await ctx.scheduler.runAfter(0, internal.whatsappTemplates.sendWelcomeMessage, {
          phoneNumber: standardizedAltMobile,
          leadId: leadId,
        });
      } catch (error) {
        console.error("Failed to schedule welcome WhatsApp template to alternate mobile:", error);
      }
    }
    
    return { status: "created", id: leadId };
  }
});

export const checkIndiamartLeadExists = internalQuery({
  args: { 
    uniqueQueryId: v.string(),
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

    // Fallback: check by unique query ID (for legacy data)
    const leadByQueryId = await ctx.db
      .query("leads")
      .withIndex("by_indiamart_id", (q) => q.eq("indiamartUniqueId", args.uniqueQueryId))
      .first();
    
    if (leadByQueryId) {
      return {
        _id: leadByQueryId._id,
        type: leadByQueryId.type,
      };
    }

    // Check R2
    let r2Lead = await ctx.db
      .query("r2_leads_mock")
      .withIndex("by_mobile", (q) => q.eq("mobile", standardizedMobile))
      .first();
      
    if (!r2Lead && args.uniqueQueryId) {
      r2Lead = await ctx.db
        .query("r2_leads_mock")
        .withIndex("by_indiamart_id", (q) => q.eq("indiamartUniqueId", args.uniqueQueryId))
        .first();
    }
    
    if (r2Lead) {
      return null; // Will be restored in processIndiamartLead
    }

    return null;
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
      
      // Also update follow-up history
      const pending = await ctx.db
        .query("followups")
        .withIndex("by_lead", (q) => q.eq("leadId", args.id))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .collect();

      for (const followup of pending) {
        const isOverdue = now > (followup.scheduledAt + 20 * 60 * 1000);
        await ctx.db.patch(followup._id, {
          status: "completed",
          completedAt: now,
          completionStatus: isOverdue ? "overdue" : "timely",
        });
      }
      
      // Create new follow-up for "now" (immediate attention)
      await ctx.db.insert("followups", {
        leadId: args.id,
        userId: lead.assignedTo,
        assignedTo: lead.assignedTo,
        scheduledAt: now,
        status: "pending",
      });
    }

    // Standardize phone numbers before merging
    const standardizedMobile = standardizePhoneNumber(args.mobile);
    const standardizedAltMobile = args.altMobile ? standardizePhoneNumber(args.altMobile) : undefined;

    // Merge fields
    if (args.name) updates.name = args.name;
    if (standardizedMobile) updates.mobile = standardizedMobile;
    if (args.email) updates.email = args.email;
    if (standardizedAltMobile) updates.altMobile = standardizedAltMobile;
    if (args.agencyName) updates.agencyName = args.agencyName;
    if (args.pincode) updates.pincode = args.pincode;
    if (args.state) updates.state = args.state;
    
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
      content: `Lead reposted from IndiaMART.\\nNew Message: ${args.message || "No message"}\\nSubject: ${args.subject}`,
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
    // Standardize phone numbers before creating
    const standardizedMobile = standardizePhoneNumber(args.mobile);
    const standardizedAltMobile = args.altMobile ? standardizePhoneNumber(args.altMobile) : undefined;

    // Validate name and mobile
    if (!standardizedMobile || standardizedMobile.length < 10) {
      console.warn(`Skipping IndiaMART lead with invalid mobile: id=${args.uniqueQueryId}, mobile="${args.mobile}", name="${args.name}"`);
      return null;
    }
    if (!args.name || args.name.trim() === "" || args.name.trim() === "*") {
      console.warn(`Skipping IndiaMART lead with invalid name: id=${args.uniqueQueryId}, name="${args.name}"`);
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
      args.message,
    ].filter(Boolean).join(" ");

    // NEW LEADS GO DIRECTLY TO R2 (cold storage) to keep Convex lean
    // They will be restored to Convex only when a user opens them or a WhatsApp message arrives
    const leadData = {
      name: args.name,
      subject: args.subject,
      source: "IndiaMART",
      mobile: standardizedMobile,
      altMobile: standardizedAltMobile,
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
      searchText,
    };

    await ctx.db.insert("r2_leads_mock", {
      originalId: `indiamart_${args.uniqueQueryId}`,
      leadData: { lead: leadData },
      mobile: standardizedMobile,
      indiamartUniqueId: args.uniqueQueryId,
      name: args.name,
      searchText,
      status: "Cold",
      source: "IndiaMART",
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
      }
    }

    // NOTE: Welcome WhatsApp is NOT sent here because we don't have a Convex leadId yet.
    // When the lead replies to any future message, processWhatsAppLead will restore them from R2.

    return null; // R2 leads don't have a Convex leadId yet
  },
});