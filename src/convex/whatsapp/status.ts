"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// Send read receipt to WhatsApp
export const markMessageAsRead = internalAction({
  args: {
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    
    if (!accessToken || !phoneNumberId) {
      console.error("WhatsApp API not configured for read receipts");
      return;
    }

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
            status: "read",
            message_id: args.messageId,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        console.error("Failed to send read receipt:", data);
      } else {
        console.log(`Sent read receipt for message ${args.messageId}`);
      }
    } catch (error) {
      console.error("Error sending read receipt:", error);
    }
  },
});

export const markMessagesAsRead = internalAction({
  args: {
    messageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    
    if (!accessToken || !phoneNumberId) {
      console.error("WhatsApp API not configured for read receipts");
      return;
    }

    // Process in parallel
    await Promise.all(args.messageIds.map(async (messageId) => {
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
              status: "read",
              message_id: messageId,
            }),
          }
        );

        if (!response.ok) {
          const data = await response.json();
          console.error(`Failed to send read receipt for ${messageId}:`, data);
        }
      } catch (error) {
        console.error(`Error sending read receipt for ${messageId}:`, error);
      }
    }));
    
    console.log(`Processed read receipts for ${args.messageIds.length} messages`);
  },
});
