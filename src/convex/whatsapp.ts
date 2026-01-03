"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

export const sendWhatsAppMessage = action({
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

    try {
      // Prepare message payload
      const payload: any = {
        messaging_product: "whatsapp",
        to: args.phoneNumber,
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

export const sendWhatsAppMedia = action({
  args: {
    phoneNumber: v.string(),
    message: v.optional(v.string()),
    leadId: v.id("leads"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    
    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured.");
    }

    try {
      // Get the file URL from Convex storage
      const fileUrl = await ctx.storage.getUrl(args.storageId);
      
      if (!fileUrl) {
        throw new Error("Failed to get file URL");
      }

      // Determine media type
      const isImage = args.mimeType.startsWith("image/");
      const mediaType = isImage ? "image" : "document";

      // Send media via WhatsApp Cloud API
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
            type: mediaType,
            [mediaType]: {
              link: fileUrl,
              caption: args.message || undefined,
              filename: mediaType === "document" ? args.fileName : undefined,
            },
          }),
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
        content: args.message || "",
        direction: "outbound",
        status: "sent",
        externalId: data.messages?.[0]?.id || "",
        messageType: isImage ? "image" : "file",
        mediaUrl: fileUrl,
        mediaName: args.fileName,
        mediaMimeType: args.mimeType,
      });

      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      console.error("WhatsApp media send error:", error);
      throw new Error(`Failed to send media: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});

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

// Handle incoming WhatsApp messages
export const handleIncomingMessage = internalAction({
  args: {
    from: v.string(),
    messageId: v.string(),
    timestamp: v.string(),
    text: v.string(),
    type: v.string(),
    mediaId: v.optional(v.string()),
    mediaMimeType: v.optional(v.string()),
    mediaFilename: v.optional(v.string()),
    senderName: v.optional(v.string()),
    quotedMessageExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Find lead by phone number
      const allLeads = await ctx.runQuery("whatsappMutations:getLeadsForMatching" as any, {});
      
      // Clean phone number (remove + and spaces)
      const cleanPhone = args.from.replace(/[\s+]/g, "");
      
      const matchingLeads = allLeads.filter((lead: any) => {
        const leadPhone = lead.mobile.replace(/[\s+]/g, "");
        return leadPhone.includes(cleanPhone) || cleanPhone.includes(leadPhone);
      });

      let leadId;
      let isNewLead = false;

      if (matchingLeads && matchingLeads.length > 0) {
        leadId = matchingLeads[0]._id;
      } else {
        console.log(`No lead found for phone number: ${args.from}. Creating new lead.`);
        leadId = await ctx.runMutation("whatsappMutations:createLeadFromWhatsApp" as any, {
          phoneNumber: args.from,
          name: args.senderName,
          message: args.text,
        });
        isNewLead = true;
      }

      if (leadId) {
        // Download media if present
        let mediaUrl = null;
        if (args.mediaId) {
          try {
            const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
            
            // Get media URL from WhatsApp
            const mediaResponse = await fetch(
              `https://graph.facebook.com/v20.0/${args.mediaId}`,
              {
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                },
              }
            );
            
            const mediaData = await mediaResponse.json();
            
            if (mediaData.url) {
              // Download the media file
              const fileResponse = await fetch(mediaData.url, {
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                },
              });
              
              const fileBlob = await fileResponse.blob();
              
              // Upload to Convex storage
              const storageId = await ctx.storage.store(fileBlob);
              mediaUrl = await ctx.storage.getUrl(storageId);
            }
          } catch (error) {
            console.error("Error downloading incoming media:", error);
          }
        }

        // Determine message type
        let messageType = "text";
        if (args.type === "image") {
          messageType = "image";
        } else if (args.type === "document" || args.type === "video" || args.type === "audio") {
          messageType = "file";
        }

        // Store incoming message
        const messageId = await ctx.runMutation("whatsappMutations:storeMessage" as any, {
          leadId,
          phoneNumber: args.from,
          content: args.text,
          direction: "inbound",
          status: "received",
          externalId: args.messageId,
          messageType: messageType !== "text" ? messageType : undefined,
          mediaUrl: mediaUrl || undefined,
          mediaName: args.mediaFilename || undefined,
          mediaMimeType: args.mediaMimeType || undefined,
          quotedMessageExternalId: args.quotedMessageExternalId,
        });

        // Send welcome message for new leads
        if (isNewLead) {
          console.log(`Sending welcome message to new lead ${leadId}`);
          try {
            await ctx.runAction(internal.whatsapp.sendWelcomeMessage, {
              leadId,
              phoneNumber: args.from,
            });
          } catch (error) {
            console.error("Error sending welcome message:", error);
          }
        } else {
            // TRIGGER AUTO REPLY FOR EXISTING LEADS
            // We only auto-reply to text messages for now to avoid loops or confusion with media
            if (args.type === "text") {
                console.log(`Triggering auto-reply for lead ${leadId}`);
                // We use runAction to call the public action (or we can make it internal)
                // Since generateAndSendAiReply is public, we use api.whatsappAi
                // But we are in an internalAction, so we can call public actions via ctx.runAction(api...)
                
                // We need a userId. We'll use a system user or just pass undefined if we handle it.
                // I updated generateAndSendAiReply to make userId optional.
                
                // Get recent messages for context
                const recentMessages = await ctx.runQuery(api.whatsappQueries.getChatMessages, { leadId });
                const contextMessages = recentMessages.slice(-5).map((m: any) => ({
                    role: m.direction === "outbound" ? "assistant" : "user",
                    content: m.content
                }));

                await ctx.runAction(api.whatsappAi.generateAndSendAiReply, {
                    leadId,
                    phoneNumber: args.from,
                    context: { recentMessages: contextMessages },
                    prompt: args.text, // Use the incoming message as the prompt/trigger
                    isAutoReply: true
                });
            }
        }

        console.log(`Stored incoming message from ${args.from} for lead ${leadId}`);
      }
    } catch (error) {
      console.error("Error handling incoming message:", error);
    }
  },
});

// Handle status updates from WhatsApp webhooks
export const handleStatusUpdate = internalAction({
  args: {
    messageId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation("whatsappMutations:updateMessageStatus" as any, {
        externalId: args.messageId,
        status: args.status,
      });
      console.log(`Updated message ${args.messageId} to status: ${args.status}`);
    } catch (error) {
      console.error("Error handling status update:", error);
    }
  },
});

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

export const sendWhatsAppMessageInternal = internalAction({
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

export const updateWhatsAppInterface = action({
  args: {},
  handler: async (ctx) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured");
    }

    const results = {
      commands: false,
      iceBreakers: false,
      errors: [] as string[]
    };

    // The /commands endpoint is not valid for WhatsApp Cloud API.
    // We will attempt to set commands via conversational_automation if supported.
    // If commands are not supported, we will fallback to just setting Ice Breakers.
    
    try {
      const payload = {
        prompts: [
          "What are your business hours?",
          "Where are you located?",
          "I want to see your catalog",
          "What services do you offer?"
        ],
        commands: [
          {
            command_name: "image",
            description: "Send an image"
          },
          {
            command_name: "faq",
            description: "Frequently Asked Questions"
          }
        ]
      };
      
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/conversational_automation`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        console.error("Initial sync failed:", JSON.stringify(data));
        
        // If it fails, it's likely because 'commands' field is not supported or invalid.
        // Retry with only prompts (Ice Breakers)
        console.log("Retrying with only prompts (Ice Breakers)...");
        
        const retryPayload = { prompts: payload.prompts };
        const retryResponse = await fetch(
          `https://graph.facebook.com/v20.0/${phoneNumberId}/conversational_automation`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(retryPayload),
          }
        );
        
        if (!retryResponse.ok) {
           const retryData = await retryResponse.json();
           results.errors.push(`Sync Error: ${JSON.stringify(retryData)}`);
        } else {
           results.iceBreakers = true;
           results.errors.push("Note: Slash commands are not supported via API, only Ice Breakers were set.");
        }
      } else {
        results.iceBreakers = true;
        results.commands = true;
      }
    } catch (e) {
      results.errors.push(`Exception: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    return results;
  }
});