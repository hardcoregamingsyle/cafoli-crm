import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { ROLES } from "../schema";
import { Id } from "../_generated/dataModel";

// Internal query: get all Convex leads for export
export const getConvexLeadsForExport = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user?.role !== ROLES.ADMIN) throw new Error("Only admins can export");

    const leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(10000);

    const enriched = await Promise.all(
      leads.map(async (lead) => {
        let assignedToName = "";
        if (lead.assignedTo) {
          const assignedUser = await ctx.db.get(lead.assignedTo);
          assignedToName = assignedUser?.name || "";
        }
        return {
          name: lead.name ?? "",
          subject: lead.subject ?? "",
          source: lead.source ?? "",
          mobile: lead.mobile ?? "",
          altMobile: lead.altMobile ?? "",
          email: lead.email ?? "",
          altEmail: lead.altEmail ?? "",
          agencyName: lead.agencyName ?? "",
          pincode: lead.pincode ?? "",
          state: lead.state ?? "",
          district: lead.district ?? "",
          station: lead.station ?? "",
          message: lead.message ?? "",
          status: lead.status ?? "",
          type: lead.type ?? "",
          assignedToName,
          nextFollowUpDate: lead.nextFollowUpDate ?? null,
          lastActivity: lead.lastActivity,
          pharmavendsUid: lead.pharmavendsUid ?? "",
          indiamartUniqueId: lead.indiamartUniqueId ?? "",
          _id: lead._id as string,
          _creationTime: lead._creationTime,
          _isR2: false,
        };
      })
    );

    return enriched;
  },
});

// Internal query: get all R2 lead IDs
export const getAllR2LeadIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const r2Leads = await ctx.db.query("r2_leads_mock").take(10000);
    return r2Leads.map((r) => ({ r2Id: r._id as string, originalId: r.originalId }));
  },
});

// Internal mutation: restore a single R2 lead to Convex temporarily and return its new lead ID + original data
export const restoreR2LeadForExport = internalMutation({
  args: { r2Id: v.id("r2_leads_mock") },
  handler: async (ctx, args) => {
    const r2Lead = await ctx.db.get(args.r2Id);
    if (!r2Lead) return null;

    const data = r2Lead.leadData as any;
    let leadData: any;

    if (data.lead && typeof data.lead === "object" && !Array.isArray(data.lead)) {
      leadData = { ...data.lead };
    } else {
      leadData = { ...data };
    }

    delete leadData._id;
    delete leadData._creationTime;

    // Insert the lead temporarily (for export only — no dedup check)
    const newLeadId = await ctx.db.insert("leads", leadData);

    // Delete the R2 entry so it doesn't conflict
    await ctx.db.delete(args.r2Id);

    return {
      newLeadId: newLeadId as string,
      r2Id: args.r2Id as string,
      originalData: {
        originalId: r2Lead.originalId,
        leadData: r2Lead.leadData,
        mobile: r2Lead.mobile,
        indiamartUniqueId: r2Lead.indiamartUniqueId,
        name: r2Lead.name,
        searchText: r2Lead.searchText,
        status: r2Lead.status,
        source: r2Lead.source,
      },
    };
  },
});

// Internal query: get a lead by ID for export
export const getLeadForExport = internalQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return null;

    let assignedToName = "";
    if (lead.assignedTo) {
      const assignedUser = await ctx.db.get(lead.assignedTo);
      assignedToName = assignedUser?.name || "";
    }

    return {
      name: lead.name ?? "",
      subject: lead.subject ?? "",
      source: lead.source ?? "",
      mobile: lead.mobile ?? "",
      altMobile: lead.altMobile ?? "",
      email: lead.email ?? "",
      altEmail: lead.altEmail ?? "",
      agencyName: lead.agencyName ?? "",
      pincode: lead.pincode ?? "",
      state: lead.state ?? "",
      district: lead.district ?? "",
      station: lead.station ?? "",
      message: lead.message ?? "",
      status: lead.status ?? "",
      type: lead.type ?? "",
      assignedToName,
      nextFollowUpDate: lead.nextFollowUpDate ?? null,
      lastActivity: lead.lastActivity,
      pharmavendsUid: lead.pharmavendsUid ?? "",
      indiamartUniqueId: lead.indiamartUniqueId ?? "",
      _id: lead._id as string,
      _creationTime: lead._creationTime,
      _isR2: true,
    };
  },
});

// Internal mutation: delete the temporarily restored lead and re-insert the R2 entry
export const reoffloadRestoredLead = internalMutation({
  args: {
    tempLeadId: v.id("leads"),
    originalData: v.any(),
  },
  handler: async (ctx, args) => {
    // Delete the temporarily restored lead
    const chats = await ctx.db.query("chats").withIndex("by_lead", (q) => q.eq("leadId", args.tempLeadId)).collect();
    for (const chat of chats) {
      const msgs = await ctx.db.query("messages").withIndex("by_chat", (q) => q.eq("chatId", chat._id)).collect();
      for (const msg of msgs) await ctx.db.delete(msg._id);
      await ctx.db.delete(chat._id);
    }
    const comments = await ctx.db.query("comments").withIndex("by_lead", (q) => q.eq("leadId", args.tempLeadId)).collect();
    for (const c of comments) await ctx.db.delete(c._id);
    const followups = await ctx.db.query("followups").withIndex("by_lead", (q) => q.eq("leadId", args.tempLeadId)).collect();
    for (const f of followups) await ctx.db.delete(f._id);
    await ctx.db.delete(args.tempLeadId);

    // Re-insert the R2 entry with original data
    const orig = args.originalData;
    await ctx.db.insert("r2_leads_mock", {
      originalId: orig.originalId,
      leadData: orig.leadData,
      mobile: orig.mobile,
      indiamartUniqueId: orig.indiamartUniqueId,
      name: orig.name,
      searchText: orig.searchText,
      status: orig.status,
      source: orig.source,
    });
  },
});