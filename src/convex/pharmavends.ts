"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

interface PharmavendsLead {
  uid: number;
  name: string;
  companyname: string | null;
  email: string;
  ContactNo: string;
  WhatsApp: string;
  Location: string;
  State: string;
  Pincode: string;
  Description: string;
  GStNo: string;
  DrugLiencence: string;
  Receivedon: string;
  Requirmenttype: string;
  Timetocall: string;
  Profession: string;
  Experience: string;
}

interface PharmavendsResponse {
  status: string;
  message: string;
  purchased_leads: PharmavendsLead[];
}

export const fetchPharmavendsLeads = action({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const endDate = now.toISOString().split('T')[0]; // yyyy-mm-dd
    
    // Fetch leads from the last 24 hours to avoid missing any
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const apiUrl = `https://pharmavends.net/api/company-profile?apitoken=RgX9pgJT07mcSX9zp3BmjAH6pdlG6oWhM2tZi4BvnU9TwQV1VG&start_date=${startDate}&end_date=${endDate}`;
    
    try {
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        console.error(`Pharmavends API error: ${response.status} ${response.statusText}`);
        return { success: false, error: `API returned ${response.status}` };
      }
      
      const data: PharmavendsResponse = await response.json();
      
      if (data.status !== "true" || !data.purchased_leads) {
        console.error("Invalid response from Pharmavends API");
        return { success: false, error: "Invalid API response" };
      }
      
      let newLeadsCount = 0;
      let duplicatesCount = 0;
      
      // Process each lead
      for (const lead of data.purchased_leads) {
        // Check if lead already exists by uid
        const existing = await ctx.runQuery(internal.pharmavendsMutations.checkLeadExists, {
          uid: lead.uid.toString(),
        });
        
        if (existing) {
          duplicatesCount++;
          continue;
        }
        
        // Create the lead
        await ctx.runMutation(internal.pharmavendsMutations.createPharmavendsLead, {
          uid: lead.uid.toString(),
          name: lead.name,
          subject: `${lead.Profession} - ${lead.Requirmenttype}`,
          mobile: lead.ContactNo,
          altMobile: lead.WhatsApp !== lead.ContactNo ? lead.WhatsApp : undefined,
          email: lead.email,
          agencyName: lead.companyname || undefined,
          pincode: lead.Pincode,
          state: lead.State,
          station: lead.Location,
          message: lead.Description,
          metadata: {
            gstNo: lead.GStNo,
            drugLicence: lead.DrugLiencence,
            receivedOn: lead.Receivedon,
            requirementType: lead.Requirmenttype,
            timeToCall: lead.Timetocall,
            profession: lead.Profession,
            experience: lead.Experience,
          },
        });
        
        newLeadsCount++;
      }
      
      console.log(`Pharmavends sync completed: ${newLeadsCount} new leads, ${duplicatesCount} duplicates skipped`);
      
      return {
        success: true,
        newLeads: newLeadsCount,
        duplicates: duplicatesCount,
        total: data.purchased_leads.length,
      };
      
    } catch (error) {
      console.error("Error fetching Pharmavends leads:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
