"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const fetchPharmavendsLeads = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiUrl = "https://script.google.com/macros/s/AKfycbxKrR7SZjO_DhJwJhguvAmnejgddGydFEvJSdsnmV-hl1UQMINjWNQ-dxJRNT155m-H/exec";
    
    try {
      console.log(`Fetching leads from: ${apiUrl}`);
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        console.error(`Google Script API error: ${response.status} ${response.statusText}`);
        return { success: false, error: `API returned ${response.status}` };
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        return { success: false, error: "Received HTML response" };
      }

      const data = await response.json();
      
      if (!Array.isArray(data)) {
        console.error("Invalid response from Google Script API: Expected array", data);
        return { success: false, error: "Invalid API response" };
      }
      
      // Debug: Log keys of the first item to help with mapping
      if (data.length > 0) {
        console.log("First item keys:", Object.keys(data[0]));
        console.log("First item sample:", JSON.stringify(data[0]));
      }

      let newLeadsCount = 0;
      let duplicatesCount = 0;
      let skippedCount = 0;
      
      // Helper to clean values (remove leading "* " if present)
      const cleanValue = (val: any) => {
        if (!val) return "";
        const str = String(val).trim();
        return str.startsWith("* ") ? str.substring(2) : str;
      };
      
      // Process each lead
      for (const item of data) {
        // Map fields based on the logs which show "Column A", "Column B", etc.
        // Column A: UID
        // Column B: Source
        // Column C: Name
        // Column D: Subject
        // Column E: Email
        // Column F: Mobile
        // Column G: Message
        
        const uid = String(
          item["Column A"] || 
          item["Query No."] || 
          item["Query_No"] || 
          item["id"] || 
          ""
        ).trim();
        
        if (!uid) {
          if (skippedCount < 5) {
             console.log("Skipping item with no UID:", JSON.stringify(item));
          }
          skippedCount++;
          continue;
        }

        // Check if lead already exists by mobile number (primary) or uid (fallback)
        const existing = await ctx.runQuery(internal.pharmavendsMutations.checkLeadExists, {
          uid: uid,
          mobile: cleanValue(item["Column F"] || item["Mobile No."] || item["Mobile"] || ""),
        });
        
        if (existing) {
          // If lead exists but is Irrelevant, reactivate it
          if (existing.type === "Irrelevant") {
            await ctx.runMutation(internal.pharmavendsMutations.reactivateLead, {
              id: existing._id,
            });
            console.log(`Reactivated irrelevant lead: ${uid}`);
            newLeadsCount++; 
          } else {
            // Merge duplicate lead
            await ctx.runMutation(internal.pharmavendsMutations.mergePharmavendsLead, {
              id: existing._id,
              uid: uid,
              name: cleanValue(item["Column C"] || item["Query_Name"] || item["Name"] || "Unknown"),
              subject: String(item["Column D"] || item["Subject"] || "No Subject"),
              mobile: cleanValue(item["Column F"] || item["Mobile No."] || item["Mobile"] || ""),
              altMobile: cleanValue(item["Alt_Mobile"] || item["Alt Mobile"]),
              email: cleanValue(item["Column E"] || item["Email"]),
              altEmail: cleanValue(item["Alt_Email"] || item["Alt Email"]),
              agencyName: cleanValue(item["Agency Name"] || item["Agency_Name"]),
              pincode: String(item["Pincode"] || item["pincode"] || ""),
              state: cleanValue(item["State"] || item["state"]),
              district: cleanValue(item["District"] || item["district"]),
              station: cleanValue(item["Station"] || item["station"]),
              message: cleanValue(item["Column G"] || item["Message"] || item["message"]),
            });
            console.log(`Merged duplicate lead: ${uid}`);
            duplicatesCount++; // Still count as duplicate for stats, or maybe separate? Keeping as duplicate for now.
          }
          continue;
        }
        
        // Create the lead
        await ctx.runMutation(internal.pharmavendsMutations.createPharmavendsLead, {
          uid: uid,
          name: cleanValue(item["Column C"] || item["Query_Name"] || item["Name"] || "Unknown"),
          subject: String(item["Column D"] || item["Subject"] || "No Subject"),
          mobile: cleanValue(item["Column F"] || item["Mobile No."] || item["Mobile"] || ""),
          altMobile: cleanValue(item["Alt_Mobile"] || item["Alt Mobile"]),
          email: cleanValue(item["Column E"] || item["Email"]),
          altEmail: cleanValue(item["Alt_Email"] || item["Alt Email"]),
          agencyName: cleanValue(item["Agency Name"] || item["Agency_Name"]),
          pincode: String(item["Pincode"] || item["pincode"] || ""),
          state: cleanValue(item["State"] || item["state"]),
          district: cleanValue(item["District"] || item["district"]),
          station: cleanValue(item["Station"] || item["station"]),
          message: cleanValue(item["Column G"] || item["Message"] || item["message"]),
        });
        
        newLeadsCount++;
      }
      
      console.log(`Google Sheet sync completed: ${newLeadsCount} new leads, ${duplicatesCount} duplicates skipped, ${skippedCount} invalid items skipped`);
      
      return {
        success: true,
        newLeads: newLeadsCount,
        duplicates: duplicatesCount,
        skipped: skippedCount,
        total: data.length,
      };
      
    } catch (error) {
      console.error("Error fetching leads from Google Sheet:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const manualSyncPharmavends = action({
  args: {},
  handler: async (ctx) => {
    // Call the internal action
    // We can't call internalAction from action directly in the same runtime easily if we want to return the result
    // But since they are both node actions, we can just run the logic or call it via runAction if exposed.
    // However, internal actions are for internal use.
    // Let's just call the internal action via the scheduler or just duplicate logic? 
    // Better: use ctx.runAction if it was public, but it is internal.
    // Actually, we can just call the internal action from here if we change it to be a public action or just wrap it.
    // Since we are in "use node", we can call other actions.
    
    // For simplicity, let's just return success and trigger the internal action in background
    await ctx.scheduler.runAfter(0, internal.pharmavends.fetchPharmavendsLeads, {});
    return { success: true, message: "Sync started in background" };
  }
});