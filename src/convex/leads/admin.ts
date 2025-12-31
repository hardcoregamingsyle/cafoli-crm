import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ROLES } from "../schema";
import { standardizePhoneNumber } from "../leadUtils";

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

      await ctx.db.insert("leads", {
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

      importedCount++;
    }

    return { importedCount };
  },
});
