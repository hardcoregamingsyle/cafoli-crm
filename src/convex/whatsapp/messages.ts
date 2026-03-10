"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";

// Helper to validate WhatsApp credentials
function getWhatsAppCredentials(): { accessToken: string; phoneNumberId: string } {
  const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  
  if (!accessToken || !phoneNumberId) {
    const missing = [];
    if (!accessToken) missing.push("CLOUD_API_ACCESS_TOKEN");
    if (!phoneNumberId) missing.push("WA_PHONE_NUMBER_ID");
    
    throw new Error(
      `WhatsApp API not configured. Missing: ${missing.join(", ")}. ` +
      `Set these in Convex dashboard > Environment Variables.`
    );
  }
  
  return { accessToken, phoneNumberId };
}

export const send = action({
  args: {
    phoneNumber: v.string(),
    message: v.string(),
    leadId: v.id("leads"),
    quotedMessageId: v.optional(v.id("messages")),
    quotedMessageExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { accessToken, phoneNumberId } = getWhatsAppCredentials();

    if (!args.phoneNumber || args.phoneNumber.trim() === "") {
      throw new Error("Phone number is required and cannot be empty");
    }

    try {
      const cleanedPhone = args.phoneNumber.replace(/[\s-]/g, "");
      
      const payload: any = {
        messaging_product: "whatsapp",
        to: cleanedPhone,
        type: "text",
        text: { body: args.message },
      };

      if (args.quotedMessageExternalId) {
        payload.context = {
          message_id: args.quotedMessageExternalId
        };
      }

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
        console.error("WhatsApp API error:", JSON.stringify(data));
        throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
      }

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

// Public action so frontend can call it directly via useAction
export const sendMedia = action({
  args: {
    phoneNumber: v.string(),
    message: v.optional(v.string()),
    leadId: v.id("leads"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(`[SEND_MEDIA] Starting for ${args.fileName} (${args.mimeType})`);
    
    try {
      const { accessToken, phoneNumberId } = getWhatsAppCredentials();
      
      // Check cache first
      const cached = await ctx.runQuery(internal.whatsapp.mediaCache.get, { storageId: args.storageId });
      let mediaId = cached?.mediaId;
      let mediaType: string;

      // Determine media type
      if (args.mimeType.startsWith("image/")) mediaType = "image";
      else if (args.mimeType.startsWith("video/")) mediaType = "video";
      else if (args.mimeType.startsWith("audio/")) mediaType = "audio";
      else mediaType = "document";

      if (mediaId) {
        console.log(`[SEND_MEDIA] Found cached media ID: ${mediaId}`);
        try {
          const result = await sendMediaMessage(accessToken, phoneNumberId, args.phoneNumber, mediaType, mediaId, args.message, args.fileName);
          
          const fileUrl = await ctx.storage.getUrl(args.storageId);
          await ctx.runMutation("whatsappMutations:storeMessage" as any, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            content: args.message || "",
            direction: "outbound",
            status: "sent",
            externalId: result.messages?.[0]?.id || "",
            messageType: mediaType,
            mediaUrl: fileUrl,
            mediaName: args.fileName,
            mediaMimeType: args.mimeType,
          });
          return { success: true, messageId: result.messages?.[0]?.id };
        } catch (e) {
          console.warn(`[SEND_MEDIA] Failed to send with cached ID, retrying with upload...`, e);
          await ctx.runMutation(internal.whatsapp.mediaCache.remove, { storageId: args.storageId });
          mediaId = undefined;
        }
      }

      if (!mediaId) {
        console.log(`[SEND_MEDIA] Fetching from storage: ${args.storageId}`);
        const fileBlob = await ctx.storage.get(args.storageId);
        
        if (!fileBlob) {
          throw new Error(`File not found: ${args.storageId}`);
        }
        
        console.log(`[SEND_MEDIA] File size: ${fileBlob.size} bytes`);

        const formData = new FormData();
        formData.append("file", fileBlob, args.fileName);
        formData.append("messaging_product", "whatsapp");

        const uploadResponse = await fetch(
          `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
          {
            method: "POST",
            headers: { "Authorization": `Bearer ${accessToken}` },
            body: formData,
          }
        );

        const uploadData = await uploadResponse.json();
        
        if (!uploadResponse.ok) {
          console.error(`[SEND_MEDIA] Upload failed:`, uploadData);
          throw new Error(`Upload error: ${JSON.stringify(uploadData)}`);
        }

        mediaId = uploadData.id;
        if (!mediaId) throw new Error("No media ID returned");
        
        console.log(`[SEND_MEDIA] Uploaded, media ID: ${mediaId}`);
        
        await ctx.runMutation(internal.whatsapp.mediaCache.save, {
          storageId: args.storageId,
          mediaId: mediaId,
          mimeType: args.mimeType,
          fileName: args.fileName,
        });

        const result = await sendMediaMessage(accessToken, phoneNumberId, args.phoneNumber, mediaType, mediaId, args.message, args.fileName);

        const fileUrl = await ctx.storage.getUrl(args.storageId);

        await ctx.runMutation("whatsappMutations:storeMessage" as any, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          content: args.message || "",
          direction: "outbound",
          status: "sent",
          externalId: result.messages?.[0]?.id || "",
          messageType: mediaType,
          mediaUrl: fileUrl,
          mediaName: args.fileName,
          mediaMimeType: args.mimeType,
        });

        console.log(`[SEND_MEDIA] Success!`);
        return { success: true, messageId: result.messages?.[0]?.id };
      }
      
    } catch (error) {
      console.error("[SEND_MEDIA] ERROR:", error);
      
      await ctx.runMutation(internal.activityLogs.logActivity, {
        category: "WhatsApp: Message Going",
        action: "Media Send Error",
        details: `Failed: ${args.fileName}`,
        metadata: { 
          storageId: args.storageId,
          mimeType: args.mimeType,
          error: error instanceof Error ? error.message : String(error) 
        },
        leadId: args.leadId,
      });
      
      throw error;
    }
  },
});

// Internal version for use by other server-side actions
export const sendMediaInternal = internalAction({
  args: {
    phoneNumber: v.string(),
    message: v.optional(v.string()),
    leadId: v.id("leads"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; messageId?: string }> => {
    // Use string reference to avoid TypeScript type instantiation depth issue
    const result = await ctx.runAction("whatsapp/messages:sendMedia" as any, args);
    if (!result) {
      throw new Error("Failed to send media: No response from internal action");
    }
    return {
      success: result.success,
      messageId: result.messageId as string | undefined
    };
  },
});

// Helper function to send the media message
async function sendMediaMessage(accessToken: string, phoneNumberId: string, to: string, type: string, mediaId: string, caption?: string, filename?: string) {
  const messagePayload: any = {
    messaging_product: "whatsapp",
    to: to,
    type: type,
    [type]: { id: mediaId },
  };

  if (caption) {
    messagePayload[type].caption = caption;
  }

  if (type === "document" && filename) {
    messagePayload[type].filename = filename;
  }

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
  
  if (!response.ok) {
    throw new Error(`Send error: ${JSON.stringify(data)}`);
  }
  
  return data;
}

export const markMessagesAsRead = internalAction({
  args: {
    messageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const { accessToken, phoneNumberId } = getWhatsAppCredentials();

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