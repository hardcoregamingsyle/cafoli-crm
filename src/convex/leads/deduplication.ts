import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ROLES } from "../schema";

export const deduplicateLeads = mutation({
  args: {
    adminId: v.id("users"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can deduplicate leads");
    }

    const allLeads = await ctx.db.query("leads").collect();
    
    // Group leads by mobile number
    const mobileMap = new Map<string, Array<typeof allLeads[0]>>();
    
    for (const lead of allLeads) {
      if (!lead.mobile) continue;
      
      const existing = mobileMap.get(lead.mobile) || [];
      existing.push(lead);
      mobileMap.set(lead.mobile, existing);
    }

    // Find duplicates
    const duplicates: Array<{
      mobile: string;
      leads: Array<{ id: string; name: string; createdAt: number; source: string }>;
      keepId: string;
      deleteIds: string[];
    }> = [];

    for (const [mobile, leads] of mobileMap.entries()) {
      if (leads.length > 1) {
        // Sort by creation time (oldest first)
        const sorted = leads.sort((a, b) => a._creationTime - b._creationTime);
        
        // Keep the oldest lead, delete the rest
        const keepLead = sorted[0];
        const deleteLeads = sorted.slice(1);

        duplicates.push({
          mobile,
          leads: sorted.map(l => ({
            id: l._id,
            name: l.name,
            createdAt: l._creationTime,
            source: l.source,
          })),
          keepId: keepLead._id,
          deleteIds: deleteLeads.map(l => l._id),
        });
      }
    }

    // If dry run, just return the report
    if (args.dryRun) {
      return {
        dryRun: true,
        duplicatesFound: duplicates.length,
        totalLeadsToDelete: duplicates.reduce((sum, d) => sum + d.deleteIds.length, 0),
        duplicates: duplicates.slice(0, 50), // Return first 50 for preview
      };
    }

    // Actually delete duplicates
    let deletedCount = 0;
    for (const duplicate of duplicates) {
      for (const deleteId of duplicate.deleteIds) {
        await ctx.db.delete(deleteId as any);
        deletedCount++;
        
        // Add a comment to the kept lead
        await ctx.db.insert("comments", {
          leadId: duplicate.keepId as any,
          content: `Duplicate lead deleted during deduplication. Phone: ${duplicate.mobile}`,
          isSystem: true,
        });
      }
    }

    return {
      dryRun: false,
      duplicatesFound: duplicates.length,
      leadsDeleted: deletedCount,
      duplicates: duplicates.slice(0, 50),
    };
  },
});
