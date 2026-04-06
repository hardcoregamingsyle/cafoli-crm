import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { ROLES } from "../schema";
import { standardizePhoneNumber } from "../leadUtils";

// Helper: check if a string looks like a valid phone number
function isValidPhoneNumber(val: string): boolean {
  if (!val) return false;
  const cleaned = val.replace(/[\s\-().+]/g, "");
  // Must be 7-15 digits
  return /^\d{7,15}$/.test(cleaned);
}

export const logExport = mutation({
  args: {
    userId: v.id("users"),
    downloadNumber: v.number(),
    fileName: v.string(),
    leadCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("exportLogs", {
      userId: args.userId,
      downloadNumber: args.downloadNumber,
      fileName: args.fileName,
      leadCount: args.leadCount,
      timestamp: Date.now(),
      exportedAt: Date.now(),
    });
  },
});

export const standardizeAllPhoneNumbers = mutation({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can standardize phone numbers");
    }

    const allLeads = await ctx.db.query("leads").collect();
    
    let updatedCount = 0;
    let mergedCount = 0;
    const processedMobiles = new Set<string>();

    for (const lead of allLeads) {
      const originalMobile = lead.mobile;
      const standardizedMobile = standardizePhoneNumber(originalMobile);
      
      if (originalMobile === standardizedMobile) {
        continue;
      }

      if (processedMobiles.has(standardizedMobile)) {
        await ctx.db.insert("comments", {
          leadId: lead._id,
          content: `Duplicate phone number detected after standardization: ${standardizedMobile}. Please review and merge manually.`,
          isSystem: true,
        });
        mergedCount++;
        continue;
      }

      await ctx.db.patch(lead._id, {
        mobile: standardizedMobile,
        lastActivity: Date.now(),
      });

      processedMobiles.add(standardizedMobile);
      updatedCount++;
    }

    return {
      success: true,
      updatedCount,
      duplicatesFound: mergedCount,
      totalLeads: allLeads.length,
    };
  },
});

export const bulkImportLeads = mutation({
  args: {
    leads: v.array(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
        altEmail: v.optional(v.string()),
        mobile: v.string(),
        altMobile: v.optional(v.string()),
        source: v.optional(v.string()),
        assignedToName: v.optional(v.string()),
        agencyName: v.optional(v.string()),
        pincode: v.optional(v.string()),
        station: v.optional(v.string()),
        state: v.optional(v.string()),
        district: v.optional(v.string()),
        subject: v.optional(v.string()),
        message: v.optional(v.string()),
      })
    ),
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const adminId = args.adminId;
    if (!adminId) throw new Error("Unauthorized");

    const admin = await ctx.db.get(adminId);
    if (admin?.role !== ROLES.ADMIN) {
      throw new Error("Only admins can import leads");
    }

    const allUsers = await ctx.db.query("users").collect();
    const userMap = new Map<string, string>();
    
    for (const user of allUsers) {
      if (user.name) userMap.set(user.name.toLowerCase(), user._id);
      if (user.email) userMap.set(user.email.toLowerCase(), user._id);
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const leadData of args.leads) {
      let assignedTo = undefined;
      if (leadData.assignedToName) {
        const lookup = leadData.assignedToName.toLowerCase().trim();
        if (userMap.has(lookup)) {
          assignedTo = userMap.get(lookup);
        }
      }

      const source = leadData.source && leadData.source.trim() !== "" 
        ? leadData.source 
        : "Manual Import";

      const mobile = standardizePhoneNumber(leadData.mobile);

      // Check for duplicate by mobile number
      const existingLead = await ctx.db
        .query("leads")
        .withIndex("by_mobile", (q) => q.eq("mobile", mobile))
        .first();

      if (existingLead) {
        skippedCount++;
        console.log(`Skipped duplicate lead with mobile: ${mobile} (existing: ${existingLead.name})`);
        continue;
      }

      const searchText = [
        leadData.name,
        leadData.subject,
        mobile,
        leadData.altMobile,
        leadData.email,
        leadData.altEmail,
        leadData.message,
        leadData.agencyName,
        leadData.station,
        leadData.district,
        leadData.state
      ].filter(Boolean).join(" ");

      const leadId = await ctx.db.insert("leads", {
        name: leadData.name,
        email: leadData.email,
        altEmail: leadData.altEmail,
        mobile: mobile,
        altMobile: leadData.altMobile,
        source: source,
        assignedTo: assignedTo as any,
        agencyName: leadData.agencyName,
        pincode: leadData.pincode,
        station: leadData.station,
        state: leadData.state,
        district: leadData.district,
        subject: leadData.subject || "Imported Lead",
        message: leadData.message,
        status: "Cold",
        type: "To be Decided",
        lastActivity: Date.now(),
        searchText,
      });

      // Update sources cache
      await ctx.scheduler.runAfter(0, internal.leads.queries.meta.updateSourcesCache, { source });

      // Send welcome email if email exists
      if (leadData.email) {
        try {
          await ctx.scheduler.runAfter(0, internal.brevo.sendWelcomeEmail, {
            leadName: leadData.name,
            leadEmail: leadData.email,
            source: source,
          });
        } catch (error) {
          console.error("Failed to schedule welcome email:", error);
        }
      }

      // Send welcome WhatsApp message to primary mobile
      try {
        await ctx.scheduler.runAfter(0, internal.whatsappTemplates.sendWelcomeMessage, {
          phoneNumber: mobile,
          leadId: leadId,
        });
      } catch (error) {
        console.error("Failed to schedule welcome WhatsApp template to primary mobile:", error);
      }

      // Send welcome WhatsApp message to alternate mobile if exists
      if (leadData.altMobile) {
        const altMobile = standardizePhoneNumber(leadData.altMobile);
        try {
          await ctx.scheduler.runAfter(0, internal.whatsappTemplates.sendWelcomeMessage, {
            phoneNumber: altMobile,
            leadId: leadId,
          });
        } catch (error) {
          console.error("Failed to schedule welcome WhatsApp template to alternate mobile:", error);
        }
      }

      importedCount++;
    }

    return { importedCount, skippedCount };
  },
});

export const deleteLead = mutation({
  args: {
    leadId: v.id("leads"),
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Unauthorized: Only admins can delete leads");
    }
    await ctx.db.delete(args.leadId);
  },
});

export const fixInvalidMobiles = mutation({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can fix invalid mobiles");
    }

    const allLeads = await ctx.db.query("leads").take(10000);

    let fixedCount = 0;
    let alreadyValidCount = 0;
    let emptyCount = 0;
    const invalidSamples: string[] = [];

    for (const lead of allLeads) {
      const mobile = lead.mobile ?? "";
      if (!mobile) {
        emptyCount++;
        continue;
      }
      if (isValidPhoneNumber(mobile)) {
        alreadyValidCount++;
        continue;
      }
      // Invalid mobile — log it as a comment and clear the field
      if (invalidSamples.length < 20) invalidSamples.push(`${lead.name}: "${mobile}"`);
      await ctx.db.insert("comments", {
        leadId: lead._id,
        content: `[Auto-fix] Invalid mobile cleared: "${mobile}". Please update with correct phone number.`,
        isSystem: true,
      });
      await ctx.db.patch(lead._id, {
        mobile: "",
        lastActivity: Date.now(),
      });
      fixedCount++;
    }

    return {
      success: true,
      fixedCount,
      alreadyValidCount,
      emptyCount,
      totalLeads: allLeads.length,
      invalidSamples,
    };
  },
});

export const unassignLeadsFromNonStaff = mutation({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can unassign leads");
    }

    // Get all non-staff users (admin and uploader)
    const allUsers = await ctx.db.query("users").collect();
    const nonStaffIds = new Set(
      allUsers
        .filter(u => u.role === ROLES.ADMIN || u.role === ROLES.UPLOADER)
        .map(u => u._id)
    );

    if (nonStaffIds.size === 0) {
      return { unassignedCount: 0, message: "No admin/uploader accounts found" };
    }

    // Find all leads assigned to non-staff users
    const allLeads = await ctx.db.query("leads").take(10000);
    let unassignedCount = 0;

    for (const lead of allLeads) {
      if (lead.assignedTo && nonStaffIds.has(lead.assignedTo)) {
        await ctx.db.patch(lead._id, {
          assignedTo: undefined,
          assignedToName: undefined,
          lastActivity: Date.now(),
        });
        await ctx.db.insert("comments", {
          leadId: lead._id,
          content: `Lead unassigned from admin/uploader account by admin. Awaiting reassignment to staff.`,
          isSystem: true,
        });
        unassignedCount++;
      }
    }

    return { unassignedCount };
  },
});