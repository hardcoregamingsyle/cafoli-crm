"use node";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Add phone number standardization utility
function standardizePhoneNumber(phone: string): string {
  if (!phone) return "";
  
  // Remove all non-digit characters and spaces
  const cleaned = phone.replace(/\D/g, "");
  
  // If 10 digits, prepend '91'
  if (cleaned.length === 10) {
    return "91" + cleaned;
  }
  
  // If 11+ digits, return as-is
  return cleaned;
}

export const fetchPharmavendsLeads = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiUrl = "https://script.google.com/macros/s/AKfycbxKrR7SZjO_DhJwJhguvAmnejgddGydFEvJSdsnmV-hl1UQMINjWNQ-dxJRNT155m-H/exec";
    
    try {
      console.log(`Fetching leads from: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        redirect: 'follow',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Cafoli-Connect/1.0',
        }
      });
      
      console.log(`Response status: ${response.status} ${response.statusText}`);
      console.log(`Response URL: ${response.url}`);
      console.log(`Content-Type: ${response.headers.get("content-type")}`);
      
      if (!response.ok) {
        console.error(`Google Script API error: ${response.status} ${response.statusText}`);
        return { success: false, error: `API returned ${response.status}` };
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        const htmlPreview = await response.text();
        console.error("Received HTML response instead of JSON. Preview:", htmlPreview.substring(0, 500));
        console.error("This usually means:");
        console.error("1. The Google Apps Script needs to be redeployed as a web app");
        console.error("2. The script permissions need to be set to 'Anyone' or 'Anyone with the link'");
        console.error("3. The script URL has changed and needs to be updated");
        return { 
          success: false, 
          error: "Google Apps Script is returning HTML instead of JSON. Please check script deployment settings and ensure it's published as a web app with proper permissions." 
        };
      }

      const textResponse = await response.text();
      console.log("Raw response preview:", textResponse.substring(0, 200));
      
      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (parseError) {
        console.error("Failed to parse JSON response:", parseError);
        console.error("Response text:", textResponse.substring(0, 500));
        return { 
          success: false, 
          error: "Invalid JSON response from Google Apps Script" 
        };
      }
      
      if (!Array.isArray(data)) {
        console.error("Invalid response from Google Script API: Expected array, got:", typeof data);
        console.error("Response data:", JSON.stringify(data).substring(0, 500));
        return { success: false, error: "Invalid API response - expected array of leads" };
      }
      
      console.log(`Successfully fetched ${data.length} items from Google Sheets`);
      
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

        // Extract and standardize mobile number
        const rawMobile = cleanValue(item["Column F"] || item["Mobile No."] || item["Mobile"] || "");
        const standardizedMobile = standardizePhoneNumber(rawMobile);

        // Check if lead already exists by mobile number (primary) or uid (fallback)
        const existing = await ctx.runQuery("pharmavendsMutations:checkLeadExists" as any, {
          uid: uid,
          mobile: standardizedMobile,
        });
        
        if (existing) {
          // If lead exists but is Irrelevant, reactivate it
          if (existing.type === "Irrelevant") {
            await ctx.runMutation("pharmavendsMutations:reactivateLead" as any, {
              id: existing._id,
            });
            console.log(`Reactivated irrelevant lead: ${uid}`);
            newLeadsCount++; 
          } else {
            // Merge duplicate lead
            await ctx.runMutation("pharmavendsMutations:mergePharmavendsLead" as any, {
              id: existing._id,
              uid: uid,
              name: cleanValue(item["Column C"] || item["Query_Name"] || item["Name"] || "Unknown"),
              subject: String(item["Column D"] || item["Subject"] || "No Subject"),
              mobile: rawMobile,
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
            duplicatesCount++;
          }
          continue;
        }
        
        // Create the lead
        await ctx.runMutation("pharmavendsMutations:createPharmavendsLead" as any, {
          uid: uid,
          name: cleanValue(item["Column C"] || item["Query_Name"] || item["Name"] || "Unknown"),
          subject: String(item["Column D"] || item["Subject"] || "No Subject"),
          mobile: rawMobile,
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
      
      console.log(`Google Sheet sync completed: ${newLeadsCount} new leads, ${duplicatesCount} duplicates merged, ${skippedCount} invalid items skipped`);
      
      return {
        success: true,
        newLeads: newLeadsCount,
        duplicates: duplicatesCount,
        skipped: skippedCount,
        total: data.length,
      };
      
    } catch (error) {
      console.error("Error fetching leads from Google Sheet:", error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
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
    // Trigger the internal action in background
    await ctx.scheduler.runAfter(0, internal.pharmavends.fetchPharmavendsLeads, {});
    return { success: true, message: "Sync started in background. Check logs for details." };
  }
});