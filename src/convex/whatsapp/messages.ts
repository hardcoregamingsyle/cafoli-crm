"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { uploadBlobToMega } from "../lib/mega";

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
        payload.context = { message_id: args.quotedMessageExternalId };
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
      
      // Check WhatsApp media ID cache first (avoids re-uploading same file to both B2 and WhatsApp)
      const cached = await ctx.runQuery(internal.whatsapp.mediaCache.get, { storageId: args.storageId });
      let mediaId = cached?.mediaId;
      let displayUrl: string | null = cached?.displayUrl || null;

      // Determine media type
      let mediaType: string;
      if (args.mimeType.startsWith("image/")) mediaType = "image";
      else if (args.mimeType.startsWith("video/")) mediaType = "video";
      else if (args.mimeType.startsWith("audio/")) mediaType = "audio";
      else mediaType = "document";

      if (mediaId) {
        // Use cached media ID — no need to re-upload to WhatsApp or B2
        console.log(`[SEND_MEDIA] Using cached media ID: ${mediaId}`);
        
        // If no cached displayUrl, get Convex signed URL as fallback
        if (!displayUrl) {
          displayUrl = await ctx.storage.getUrl(args.storageId);
        }
        
        try {
          const result = await sendMediaMessage(accessToken, phoneNumberId, args.phoneNumber, mediaType, mediaId, args.message, args.fileName);
          
          await ctx.runMutation("whatsappMutations:storeMessage" as any, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            content: args.message || "",
            direction: "outbound",
            status: "sent",
            externalId: result.messages?.[0]?.id || "",
            messageType: mediaType,
            mediaUrl: displayUrl,
            mediaName: args.fileName,
            mediaMimeType: args.mimeType,
          });
          return { success: true, messageId: result.messages?.[0]?.id };
        } catch (e) {
          console.warn(`[SEND_MEDIA] Cached media ID failed, retrying with fresh upload...`, e);
          await ctx.runMutation(internal.whatsapp.mediaCache.remove, { storageId: args.storageId });
          mediaId = undefined;
          displayUrl = null;
        }
      }

      // No cache — fetch blob, upload to B2 for display URL, upload to WhatsApp for media ID
      const fileBlob = await ctx.storage.get(args.storageId);
      if (!fileBlob) {
        throw new Error(`File not found in storage: ${args.storageId}`);
      }
      console.log(`[SEND_MEDIA] File size: ${fileBlob.size} bytes`);

      // Upload to B2 for permanent display URL (only done once, then cached)
      try {
        displayUrl = await uploadBlobToMega(fileBlob, args.fileName);
        console.log(`[SEND_MEDIA] Uploaded to B2 for display URL`);
      } catch (b2Err) {
        console.warn(`[SEND_MEDIA] B2 upload failed, using Convex URL as fallback:`, b2Err);
        displayUrl = await ctx.storage.getUrl(args.storageId);
      }

      // Upload to WhatsApp to get media ID
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
        console.error(`[SEND_MEDIA] WhatsApp upload failed:`, uploadData);
        throw new Error(`Upload error: ${JSON.stringify(uploadData)}`);
      }

      mediaId = uploadData.id;
      if (!mediaId) throw new Error("No media ID returned from WhatsApp");
      
      console.log(`[SEND_MEDIA] Uploaded to WhatsApp, media ID: ${mediaId}`);
      
      // Cache both the WhatsApp media ID and the display URL
      await ctx.runMutation(internal.whatsapp.mediaCache.save, {
        storageId: args.storageId,
        mediaId: mediaId,
        mimeType: args.mimeType,
        fileName: args.fileName,
        displayUrl: displayUrl || undefined,
      });

      const result = await sendMediaMessage(accessToken, phoneNumberId, args.phoneNumber, mediaType, mediaId, args.message, args.fileName);

      await ctx.runMutation("whatsappMutations:storeMessage" as any, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        content: args.message || "",
        direction: "outbound",
        status: "sent",
        externalId: result.messages?.[0]?.id || "",
        messageType: mediaType,
        mediaUrl: displayUrl,
        mediaName: args.fileName,
        mediaMimeType: args.mimeType,
      });

      console.log(`[SEND_MEDIA] Success!`);
      return { success: true, messageId: result.messages?.[0]?.id };
      
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

// Send media from an external URL (e.g. cafoli.in product images/PDFs)
export const sendMediaFromUrl = internalAction({
  args: {
    phoneNumber: v.string(),
    message: v.optional(v.string()),
    leadId: v.id("leads"),
    url: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { accessToken, phoneNumberId } = getWhatsAppCredentials();

      // URL-encode the URL to handle spaces in filenames (e.g., cafoli.in product images)
      const encodedUrl = args.url.split("/").map((segment, i) => 
        i < 3 ? segment : encodeURIComponent(decodeURIComponent(segment))
      ).join("/");
      console.log(`[SEND_MEDIA_URL] Downloading ${encodedUrl}`);
      const fileResponse = await fetch(encodedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!fileResponse.ok) throw new Error(`Failed to download: ${fileResponse.status}`);
      const fileBlob = await fileResponse.blob();

      let mediaType: string;
      if (args.mimeType.startsWith("image/")) mediaType = "image";
      else if (args.mimeType.startsWith("video/")) mediaType = "video";
      else if (args.mimeType.startsWith("audio/")) mediaType = "audio";
      else mediaType = "document";

      // Upload to WhatsApp
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
      if (!uploadResponse.ok) throw new Error(`WA upload error: ${JSON.stringify(uploadData)}`);

      const mediaId = uploadData.id;
      if (!mediaId) throw new Error("No media ID returned");

      const result = await sendMediaMessage(accessToken, phoneNumberId, args.phoneNumber, mediaType, mediaId, args.message, args.fileName);

      await ctx.runMutation("whatsappMutations:storeMessage" as any, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        content: args.message || "",
        direction: "outbound",
        status: "sent",
        externalId: result.messages?.[0]?.id || "",
        messageType: mediaType,
        mediaUrl: args.url,
        mediaName: args.fileName,
        mediaMimeType: args.mimeType,
      });

      console.log(`[SEND_MEDIA_URL] Success for ${args.fileName}`);
      return { success: true, messageId: result.messages?.[0]?.id };
    } catch (error) {
      console.error("[SEND_MEDIA_URL] ERROR:", error);
      throw error;
    }
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

export const syncMessages = internalAction({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    const errors: string[] = [];
    let synced = 0;

    try {
      const { accessToken, phoneNumberId } = getWhatsAppCredentials();
      const limit = args.limit ?? 20;

      const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages?` +
        new URLSearchParams({
          fields: "id,from,to,timestamp,type,text,status",
          limit: String(limit),
        }),
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        const errData = await response.json();
        errors.push(`WhatsApp API error: ${JSON.stringify(errData)}`);
        return { synced, errors };
      }

      const data = await response.json();
      const waMessages: any[] = data.data || [];

      const existingIds = await ctx.runQuery(internal.whatsappMutations.getExistingExternalIds, { leadId: args.leadId });
      const existingSet = new Set(existingIds);

      for (const msg of waMessages) {
        if (!msg.id || existingSet.has(msg.id)) continue;
        try {
          const isInbound = msg.from?.phone !== phoneNumberId;
          const content = msg.text?.body || `[${msg.type || "media"}]`;
          await ctx.runMutation(internal.whatsappMutations.storeMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            content,
            direction: isInbound ? "inbound" : "outbound",
            status: msg.status || (isInbound ? "received" : "sent"),
            externalId: msg.id,
            messageType: msg.type !== "text" ? msg.type : undefined,
          });
          synced++;
        } catch (err) {
          errors.push(`Failed to store message ${msg.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (error) {
      errors.push(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { synced, errors };
  },
});

export const syncMessagesForLead = action({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args): Promise<{ synced: number; errors: string[] }> => {
    return await ctx.runAction(internal.whatsapp.messages.syncMessages, {
      leadId: args.leadId,
      phoneNumber: args.phoneNumber,
      limit: 50,
    });
  },
});