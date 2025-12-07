"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const sendWhatsAppMessage = action({
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
      throw new Error("WhatsApp API not configured. Please set CLOUD_API_ACCESS_TOKEN and WA_PHONE_NUMBER_ID in backend environment variables.");
    }

    try {
      // Send message via WhatsApp Cloud API
      const response = await fetch(
        `https://graph.facebook.com/v16.0/${phoneNumberId}/messages`,
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
            text: { body: args.message },
          }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
      }

      // Store message in database
      await ctx.runMutation(internal.whatsappMutations.storeMessage, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        content: args.message,
        direction: "outbound",
        status: "sent",
        externalId: data.messages?.[0]?.id || "",
      });

      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      console.error("WhatsApp send error:", error);
      throw new Error(`Failed to send WhatsApp message: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});

// Handle incoming WhatsApp messages
export const handleIncomingMessage = internalAction({
  args: {
    from: v.string(),
    messageId: v.string(),
    timestamp: v.string(),
    text: v.string(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Find lead by phone number
      const allLeads = await ctx.runQuery(internal.whatsappMutations.getLeadsForMatching, {});
      
      // Clean phone number (remove + and spaces)
      const cleanPhone = args.from.replace(/[\s+]/g, "");
      
      const matchingLeads = allLeads.filter(lead => {
        const leadPhone = lead.mobile.replace(/[\s+]/g, "");
        return leadPhone.includes(cleanPhone) || cleanPhone.includes(leadPhone);
      });

      if (matchingLeads && matchingLeads.length > 0) {
        const leadId = matchingLeads[0]._id;

        // Store incoming message
        await ctx.runMutation(internal.whatsappMutations.storeMessage, {
          leadId,
          phoneNumber: args.from,
          content: args.text,
          direction: "inbound",
          status: "received",
          externalId: args.messageId,
        });

        console.log(`Stored incoming message from ${args.from} for lead ${leadId}`);
      } else {
        console.log(`No lead found for phone number: ${args.from}`);
      }
    } catch (error) {
      console.error("Error handling incoming message:", error);
    }
  },
});