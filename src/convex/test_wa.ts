"use node";
import { action } from "./_generated/server";
import { uploadToMega } from "./lib/mega";

export const testFetch = action({
  args: {},
  handler: async (ctx) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    
    if (!accessToken || !phoneNumberId) {
      return "Missing credentials";
    }
    
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages?limit=10`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    
    const data = await response.json();
    return data;
  }
});

export const testB2Integration = action({
  args: {},
  handler: async (ctx) => {
    const email = process.env.MEGA_EMAIL;
    const password = process.env.MEGA_PASSWORD;

    if (!email || !password) {
      return { success: false, error: "MEGA_EMAIL or MEGA_PASSWORD not set in Convex environment variables." };
    }

    try {
      const testContent = `Cafoli CRM MEGA Integration Test - ${new Date().toISOString()}`;
      const buffer = Buffer.from(testContent, "utf-8");
      const link = await uploadToMega(buffer, "cafoli_mega_test.txt");
      return { success: true, link, message: "MEGA integration working! File uploaded successfully." };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  },
});