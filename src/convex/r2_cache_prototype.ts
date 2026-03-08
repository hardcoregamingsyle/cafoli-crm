import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const generateTestLeads = mutation({
  args: {},
  handler: async (ctx) => {
    const leads = [];
    for (let i = 1; i <= 150; i++) {
      const leadId = await ctx.db.insert("leads", {
        name: `R2 Test Lead ${i}`,
        mobile: `919999999${i.toString().padStart(3, '0')}`,
        status: "Cold",
        type: "To be Decided",
        lastActivity: Date.now(),
        source: "R2 Test",
      });
      leads.push(leadId);
    }
    return `Generated ${leads.length} test leads.`;
  }
});

export const offloadToR2 = mutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    // Find leads to offload (e.g., oldest activity)
    const leadsToOffload = await ctx.db
      .query("leads")
      .withIndex("by_last_activity")
      .filter(q => q.eq(q.field("source"), "R2 Test"))
      .take(args.limit);

    let offloadedCount = 0;
    for (const lead of leadsToOffload) {
      // Save to mock R2
      await ctx.db.insert("r2_leads_mock", {
        originalId: lead._id,
        leadData: lead,
      });
      
      // Delete from Convex (RAM)
      await ctx.db.delete(lead._id);
      offloadedCount++;
    }

    return `Offloaded ${offloadedCount} leads to R2 mock storage.`;
  }
});

export const loadFromR2 = mutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const r2Leads = await ctx.db.query("r2_leads_mock").take(args.limit);
    
    let loadedCount = 0;
    for (const r2Lead of r2Leads) {
      const data = r2Lead.leadData;
      delete data._id;
      delete data._creationTime;
      
      // Insert back to Convex
      await ctx.db.insert("leads", data);
      
      // Remove from R2 mock
      await ctx.db.delete(r2Lead._id);
      loadedCount++;
    }

    return `Loaded ${loadedCount} leads from R2 mock storage back to Convex.`;
  }
});

export const getR2Stats = query({
  args: {},
  handler: async (ctx) => {
    const convexLeads = await ctx.db
      .query("leads")
      .filter(q => q.eq(q.field("source"), "R2 Test"))
      .collect();
      
    const r2Leads = await ctx.db.query("r2_leads_mock").collect();
    
    return {
      convexActiveCount: convexLeads.length,
      r2StorageCount: r2Leads.length,
    };
  }
});
