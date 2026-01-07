"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";

export const send = action({
  args: {
    phoneNumber: v.string(),
    message: v.string(),
    leadId: v.id("leads"),
    quotedMessageId: v.optional(v.id("messages")),
    quotedMessageExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if WhatsApp is configured
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    
    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured. Please set CLOUD_API_ACCESS_TOKEN and WA_PHONE_NUMBER_ID in backend environment variables.");
    }

    // Validate phone number
    if (!args.phoneNumber || args.phoneNumber.trim() === "") {
      throw new Error("Phone number is required and cannot be empty");
    }

    try {
      // Clean phone number (remove spaces, dashes, but keep + if present)
      const cleanedPhone = args.phoneNumber.replace(/[\s-]/g, "");
      
      // Prepare message payload
      const payload: any = {
        messaging_product: "whatsapp",
        to: cleanedPhone,
        type: "text",
        text: { body: args.message },
      };

      // Add context for reply if quoted
      if (args.quotedMessageExternalId) {
        payload.context = {
          message_id: args.quotedMessageExternalId
        };
      }

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
        console.error("WhatsApp API error details:", JSON.stringify(data));
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
        quotedMessageId: args.quotedMessageId,
      });

      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      console.error("WhatsApp send error:", error);
      throw new Error(`Failed to send WhatsApp message: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});

export const sendMedia = internalAction({
  args: {
    phoneNumber: v.string(),
    message: v.optional(v.string()),
    leadId: v.id("leads"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(`[SEND_MEDIA] Called for ${args.fileName} (${args.mimeType}) to ${args.phoneNumber}`);
    console.log(`[SEND_MEDIA] StorageId: ${args.storageId}`);
    
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    
    if (!accessToken || !phoneNumberId) {
      console.error(`[SEND_MEDIA] WhatsApp API not configured`);
      throw new Error("WhatsApp API not configured.");
    }

    try {
      // Step 1: Download the file from Convex storage
      console.log(`[SEND_MEDIA] Downloading file from Convex storage...`);
      const fileUrl = await ctx.storage.getUrl(args.storageId);
      
      if (!fileUrl) {
        console.error(`[SEND_MEDIA] Failed to get file URL for storageId: ${args.storageId}`);
        throw new Error("Failed to get file URL - File not found in storage");
      }

      console.log(`[SEND_MEDIA] Fetching file data from URL...`);
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.statusText}`);
      }
      
      const fileBlob = await fileResponse.blob();
      console.log(`[SEND_MEDIA] File downloaded, size: ${fileBlob.size} bytes`);

      // Step 2: Upload the file to WhatsApp's media API
      console.log(`[SEND_MEDIA] Uploading file to WhatsApp media API...`);
      const formData = new FormData();
      formData.append("file", fileBlob, args.fileName);
      formData.append("messaging_product", "whatsapp");
      formData.append("type", args.mimeType);

      const uploadResponse = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
          },
          body: formData,
        }
      );

      const uploadData = await uploadResponse.json();
      console.log(`[SEND_MEDIA] WhatsApp media upload response:`, JSON.stringify(uploadData, null, 2));
      
      if (!uploadResponse.ok) {
        console.error(`[SEND_MEDIA] WhatsApp media upload error:`, JSON.stringify(uploadData));
        throw new Error(`WhatsApp media upload error: ${JSON.stringify(uploadData)}`);
      }

      const mediaId = uploadData.id;
      if (!mediaId) {
        throw new Error("WhatsApp did not return a media ID");
      }
      console.log(`[SEND_MEDIA] File uploaded to WhatsApp, media ID: ${mediaId}`);

      // Step 3: Send the message with the uploaded media ID
      const isImage = args.mimeType.startsWith("image/");
      const mediaType = isImage ? "image" : "document";
      console.log(`[SEND_MEDIA] Sending message with media type: ${mediaType}`);

      const messagePayload: any = {
        messaging_product: "whatsapp",
        to: args.phoneNumber,
        type: mediaType,
        [mediaType]: {
          id: mediaId,
        },
      };

      // Add caption if provided
      if (args.message) {
        messagePayload[mediaType].caption = args.message;
      }

      // Add filename for documents
      if (mediaType === "document") {
        messagePayload[mediaType].filename = args.fileName;
      }

      console.log(`[SEND_MEDIA] Message payload:`, JSON.stringify(messagePayload, null, 2));

      const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messagePayload),
        }
      );

      const data = await response.json();
      console.log(`[SEND_MEDIA] WhatsApp API response status: ${response.status}`);
      console.log(`[SEND_MEDIA] WhatsApp API response:`, JSON.stringify(data, null, 2));
      
      if (!response.ok) {
        console.error(`[SEND_MEDIA] WhatsApp API error:`, JSON.stringify(data));
        throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
      }

      if (data.messages?.[0]?.id) {
        console.log(`[SEND_MEDIA] WhatsApp accepted message with ID: ${data.messages[0].id}`);
      } else {
        console.warn(`[SEND_MEDIA] WhatsApp response missing message ID:`, data);
      }

      console.log(`[SEND_MEDIA] Message sent successfully, storing in database...`);
      await ctx.runMutation("whatsappMutations:storeMessage" as any, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        content: args.message || "",
        direction: "outbound",
        status: "sent",
        externalId: data.messages?.[0]?.id || "",
        messageType: isImage ? "image" : "file",
        mediaUrl: fileUrl,
        mediaName: args.fileName,
        mediaMimeType: args.mimeType,
      });

      console.log(`[SEND_MEDIA] Message stored successfully`);
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      console.error("[SEND_MEDIA] ERROR:", error);
      console.error("[SEND_MEDIA] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw new Error(`Failed to send media: ${error instanceof Error ? error.message : "Unknown error"}`);
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
      console.warn("WhatsApp API not configured for marking messages as read");
      return { success: false };
    }

    try {
      // Mark messages as read via WhatsApp Cloud API
      for (const messageId of args.messageIds) {
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
          console.error(`Failed to mark message ${messageId} as read:`, data);
        }
      }

      return { success: true };
    } catch (error) {
      console.error("Error marking messages as read:", error);
      return { success: false };
    }
  },
});