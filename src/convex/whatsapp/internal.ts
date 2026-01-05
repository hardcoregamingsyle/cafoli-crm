"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// Send welcome message to new WhatsApp leads
export const sendWelcomeMessage = internalAction({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    
    if (!accessToken || !phoneNumberId) {
      console.error("WhatsApp API not configured for welcome messages");
      return;
    }

    const welcomeMessage = "Thank you for contacting us! We've received your message and will get back to you shortly. 🙏";

    try {
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: args.phoneNumber,
            type: "text",
            text: { body: welcomeMessage },
          }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
      }

      // Store welcome message in database
      await ctx.runMutation("whatsappMutations:storeMessage" as any, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        content: welcomeMessage,
        direction: "outbound",
        status: "sent",
        externalId: data.messages?.[0]?.id || "",
      });

      console.log(`Welcome message sent to ${args.phoneNumber}`);
    } catch (error) {
      console.error("Error sending welcome message:", error);
    }
  },
});

export const sendMessage = internalAction({
  args: {
    phoneNumber: v.string(),
    message: v.string(),
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    // Check if WhatsApp is configured
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    
    if (!accessToken || !phoneNumberId) {
      console.error("WhatsApp API not configured for campaign execution");
      return { success: false, error: "WhatsApp not configured" };
    }

    try {
      // Prepare message payload
      const payload: any = {
        messaging_product: "whatsapp",
        to: args.phoneNumber,
        type: "text",
        text: { body: args.message },
      };

      // Send message via WhatsApp Cloud API
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
      }

      // Store message in database
      await ctx.runMutation("whatsappMutations:storeMessage" as any, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        content: args.message,
        direction: "outbound",
        status: "sent",
        externalId: data.messages?.[0]?.id || "",
      });

      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      console.error("WhatsApp send error (campaign):", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});
