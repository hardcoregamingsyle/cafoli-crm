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

    // Helper: sanitize string fields — strip newlines, tabs, carriage returns
    const clean = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      return String(v).replace(/[\r\n\t]+/g, " ").trim();
    };

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
          name: clean(lead.name),
          subject: clean(lead.subject),
          source: clean(lead.source),
          mobile: clean(lead.mobile),
          altMobile: clean(lead.altMobile),
          email: clean(lead.email),
          altEmail: clean(lead.altEmail),
          agencyName: clean(lead.agencyName),
          pincode: clean(lead.pincode),
          state: clean(lead.state),
          district: clean(lead.district),
          station: clean(lead.station),
          message: clean(lead.message),
          status: clean(lead.status),
          type: clean(lead.type),
          assignedTo: lead.assignedTo ?? null,
          assignedToName: clean(assignedToName),
          nextFollowUpDate: lead.nextFollowUpDate ?? null,
          lastActivity: lead.lastActivity,
          pharmavendsUid: clean(lead.pharmavendsUid),
          indiamartUniqueId: clean(lead.indiamartUniqueId),
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
      let leadData: any;
      if (rawData.lead && typeof rawData.lead === "object" && !Array.isArray(rawData.lead)) {
        leadData = rawData.lead;
      } else {
        leadData = rawData;
      }

      if (!leadData || typeof leadData !== "object") return null;

      // Use top-level r2Lead.mobile as authoritative source (always correct, set at offload time)
      const topLevelMobile = typeof r2Lead.mobile === "string" ? r2Lead.mobile : "";
      const leadDataMobile = typeof leadData.mobile === "string" ? leadData.mobile : "";
      const mobile = clean(topLevelMobile || leadDataMobile);

      const name = clean(leadData.name || r2Lead.name);
      const subject = clean(leadData.subject);
      const source = clean(leadData.source || r2Lead.source);
      const altMobile = clean(leadData.altMobile);
      const email = clean(leadData.email);
      const altEmail = clean(leadData.altEmail);
      const agencyName = clean(leadData.agencyName);
      const pincode = clean(leadData.pincode);
      const state = clean(leadData.state);
      const district = clean(leadData.district);
      const station = clean(leadData.station);
      const message = clean(leadData.message);
      const status = clean(leadData.status || r2Lead.status);
      const type = clean(leadData.type);
      const nextFollowUpDate = typeof leadData.nextFollowUpDate === "number" ? leadData.nextFollowUpDate : null;
      const lastActivity = typeof leadData.lastActivity === "number" ? leadData.lastActivity : r2Lead._creationTime;
      const pharmavendsUid = clean(leadData.pharmavendsUid);
      const indiamartUniqueId = clean(leadData.indiamartUniqueId || r2Lead.indiamartUniqueId);
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