import { v } from "convex/values";
import { query } from "../../_generated/server";
import { ROLES } from "../../schema";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUniqueSources = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    let isAdmin = false;
    if (userId) {
      const user = await ctx.db.get(userId);
      isAdmin = user?.role === ROLES.ADMIN;
    }

    const leads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(5000);
    const sources = new Set<string>();
    
    for (const lead of leads) {
      if (lead.source) {
        if (!isAdmin && lead.source === "R2 Test") continue;
        sources.add(lead.source);
      }
    }
    
    return Array.from(sources).sort();
  },
});

export const getAllLeadsForExport = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");
    
    const user = await ctx.db.get(userId);
    if (user?.role !== ROLES.ADMIN) {
      throw new Error("Only admins can export all leads");
    }

    // Fetch active Convex leads (up to 10000)
    const convexLeads = await ctx.db.query("leads").withIndex("by_last_activity").order("desc").take(10000);
    
    const enrichedConvexLeads = await Promise.all(
      convexLeads.map(async (lead) => {
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
          assignedTo: lead.assignedTo ?? null,
          assignedToName,
          nextFollowUpDate: lead.nextFollowUpDate ?? null,
          lastActivity: lead.lastActivity,
          pharmavendsUid: lead.pharmavendsUid ?? "",
          indiamartUniqueId: lead.indiamartUniqueId ?? "",
          _id: lead._id,
          _creationTime: lead._creationTime,
          _isR2: false,
        };
      })
    );

    // Fetch R2-archived leads (up to 10000)
    const r2Leads = await ctx.db.query("r2_leads_mock").take(10000);
    
    const enrichedR2Leads = r2Leads.map((r2Lead) => {
      const rawData = r2Lead.leadData;
      if (!rawData || typeof rawData !== "object") return null;

      // Handle nested format: { lead: {...}, chats: [...], messages: [...], ... }
      // Handle flat format: leadData IS the lead object
      let leadData: any;
      if (rawData.lead && typeof rawData.lead === "object" && !Array.isArray(rawData.lead)) {
        leadData = rawData.lead;
      } else {
        // Flat format — but verify it looks like a lead (has mobile or name)
        // Exclude nested arrays that would be the chats/messages/comments/followups keys
        leadData = rawData;
      }

      if (!leadData || typeof leadData !== "object") return null;

      // Explicitly extract only known lead scalar fields — never spread the object
      const mobile = typeof leadData.mobile === "string" ? leadData.mobile : "";
      const name = typeof leadData.name === "string" ? leadData.name : "";
      const subject = typeof leadData.subject === "string" ? leadData.subject : "";
      const source = typeof leadData.source === "string" ? leadData.source : "";
      const altMobile = typeof leadData.altMobile === "string" ? leadData.altMobile : "";
      const email = typeof leadData.email === "string" ? leadData.email : "";
      const altEmail = typeof leadData.altEmail === "string" ? leadData.altEmail : "";
      const agencyName = typeof leadData.agencyName === "string" ? leadData.agencyName : "";
      const pincode = typeof leadData.pincode === "string" ? leadData.pincode : "";
      const state = typeof leadData.state === "string" ? leadData.state : "";
      const district = typeof leadData.district === "string" ? leadData.district : "";
      const station = typeof leadData.station === "string" ? leadData.station : "";
      const message = typeof leadData.message === "string" ? leadData.message : "";
      const status = typeof leadData.status === "string" ? leadData.status : "";
      const type = typeof leadData.type === "string" ? leadData.type : "";
      const nextFollowUpDate = typeof leadData.nextFollowUpDate === "number" ? leadData.nextFollowUpDate : null;
      const lastActivity = typeof leadData.lastActivity === "number" ? leadData.lastActivity : r2Lead._creationTime;
      const pharmavendsUid = typeof leadData.pharmavendsUid === "string" ? leadData.pharmavendsUid : "";
      const indiamartUniqueId = typeof leadData.indiamartUniqueId === "string" ? leadData.indiamartUniqueId : "";
      const creationTime = typeof leadData._creationTime === "number" ? leadData._creationTime : r2Lead._creationTime;

      // Skip rows that have no mobile and no name — likely corrupt/empty entries
      if (!mobile && !name) return null;

      return {
        name,
        subject,
        source,
        mobile,
        altMobile,
        email,
        altEmail,
        agencyName,
        pincode,
        state,
        district,
        station,
        message,
        status,
        type,
        assignedTo: null,
        assignedToName: "",
        nextFollowUpDate,
        lastActivity,
        pharmavendsUid,
        indiamartUniqueId,
        _id: r2Lead._id,
        _creationTime: creationTime,
        _isR2: true,
      };
    }).filter(Boolean);

    // Merge: Convex leads first, then R2 leads
    return [...enrichedConvexLeads, ...enrichedR2Leads];
  },
});

export const getNextDownloadNumber = query({
  args: {},
  handler: async (ctx) => {
    const lastExport = await ctx.db
      .query("exportLogs")
      .order("desc")
      .first();
    
    return (lastExport?.downloadNumber || 0) + 1;
  },
});