"use node";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// Public action: export all leads (Convex first, then R2 via restore/re-offload cycle)
export const exportAllLeads = action({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<any[]> => {
    // Step 1: Get all Convex leads
    const convexLeads = await ctx.runQuery(internal.leads.exportHelpers.getConvexLeadsForExport, {
      userId: args.userId,
    });

    // Step 2: Get all R2 lead IDs
    const r2LeadIds = await ctx.runQuery(internal.leads.exportHelpers.getAllR2LeadIds, {});

    // Step 3: For each R2 lead, restore → read → re-offload
    const r2ExportLeads: any[] = [];

    for (const { r2Id } of r2LeadIds) {
      let tempLeadId: string | null = null;
      let originalData: any = null;

      try {
        // Restore R2 lead to Convex temporarily
        const restored = await ctx.runMutation(internal.leads.exportHelpers.restoreR2LeadForExport, {
          r2Id: r2Id as Id<"r2_leads_mock">,
        });

        if (!restored) continue;

        tempLeadId = restored.newLeadId;
        originalData = restored.originalData;

        // Read the restored lead data
        const leadData = await ctx.runQuery(internal.leads.exportHelpers.getLeadForExport, {
          leadId: tempLeadId as Id<"leads">,
        });

        if (leadData) {
          r2ExportLeads.push(leadData);
        }
      } catch (err) {
        console.error(`Failed to process R2 lead ${r2Id}:`, err);
      } finally {
        // Always re-offload back to R2
        if (tempLeadId && originalData) {
          try {
            await ctx.runMutation(internal.leads.exportHelpers.reoffloadRestoredLead, {
              tempLeadId: tempLeadId as Id<"leads">,
              originalData,
            });
          } catch (err) {
            console.error(`Failed to re-offload R2 lead ${r2Id}:`, err);
          }
        }
      }
    }

    return [...convexLeads, ...r2ExportLeads];
  },
});