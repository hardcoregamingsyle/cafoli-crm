"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { uploadBlobToMega } from "../lib/mega";

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
      console.log("🔵 handleIncomingMessage called", { from: args.from, messageId: args.messageId, text: args.text });
      
      const { leadId, isNewLead } = await ctx.runMutation(internal.whatsappMutations.processWhatsAppLead, {
        phoneNumber: args.from,
        name: args.senderName,
        message: args.text,
      });
      
      if (isNewLead) {
        console.log("✅ Created new lead:", leadId);
      } else {
        console.log("✅ Found existing lead:", leadId);
      }

      if (leadId) {
        // Download incoming media and upload to B2 for a permanent URL
        let mediaUrl: string | null = null;
        if (args.mediaId) {
          try {
            const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
            
            const mediaResponse = await fetch(
              `https://graph.facebook.com/v20.0/${args.mediaId}`,
              { headers: { "Authorization": `Bearer ${accessToken}` } }
            );
            
            const mediaData = await mediaResponse.json();
            
            if (mediaData.url) {
              const fileResponse = await fetch(mediaData.url, {
                headers: { "Authorization": `Bearer ${accessToken}` },
              });
              
              const fileBlob = await fileResponse.blob();
              const fileName = args.mediaFilename || `media_${args.messageId}`;
              
              try {
                // Upload to B2 for a permanent pre-signed URL
                mediaUrl = await uploadBlobToMega(fileBlob, fileName);
                console.log("✅ Incoming media uploaded to B2:", mediaUrl.substring(0, 80));
              } catch (b2Error) {
                console.error("❌ B2 upload failed, falling back to Convex storage:", b2Error);
                // Fallback: store in Convex storage
                const storageId = await ctx.storage.store(fileBlob);
                mediaUrl = await ctx.storage.getUrl(storageId);
                console.log("✅ Media stored in Convex (fallback):", storageId);
              }
            }
          } catch (error) {
            console.error("❌ Error downloading/storing incoming media:", error);
          }
        }

        let messageType = "text";
        if (args.type === "image") {
          messageType = "image";
        } else if (args.type === "document" || args.type === "video" || args.type === "audio") {
          messageType = "file";
        }

        // Check if this message was already processed (deduplication)
        const alreadyProcessed = await ctx.runQuery(internal.whatsappMutations.getExistingExternalIds, { leadId });
        const isDuplicate = alreadyProcessed.includes(args.messageId);

        if (!isDuplicate) {
          await ctx.runMutation(internal.whatsappMutations.storeMessage, {
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
          console.log("✅ Message stored in database");
        } else {
          console.log(`[DEDUP] Message ${args.messageId} already processed, skipping storage and AI`);
          return;
        }

        if (isNewLead) {
          // Check if the message is a product list / catalogue request — if so, skip welcome and let AI handle
          const msgLower = (args.text || "").toLowerCase();
          const isProductListRequest = /product\s*list|catalogue|catalog|range\s*pdf|send\s*pdf|price\s*list|all\s*products|send\s*list|send\s*range/.test(msgLower);

          if (isProductListRequest) {
            console.log(`📤 New lead requested product list — skipping welcome, triggering AI for lead ${leadId}`);
            try {
              const allMessages = await ctx.runQuery(internal.whatsappQueries.getChatMessagesInternal, { leadId });
              const contextMessages = allMessages.slice(-5).map((m: any) => ({
                role: m.direction === "outbound" ? "assistant" : "user",
                content: m.content || (m.messageType ? `[${m.messageType}]` : "[media]")
              }));
              const contactRequestMessage = await ctx.runQuery(internal.whatsappConfig.getContactRequestMessage);
              await ctx.runAction(internal.whatsappAi.generateAndSendAiReplyInternal, {
                leadId,
                phoneNumber: args.from,
                context: { recentMessages: contextMessages, contactRequestMessage },
                prompt: args.text,
                isAutoReply: true,
              });
            } catch (error) {
              console.error("❌ Error triggering AI for product list request:", error);
            }
          } else {
            console.log(`📤 Sending welcome message to new lead ${leadId}`);
            try {
              await ctx.runAction(internal.whatsappTemplates.sendWelcomeMessage, {
                leadId,
                phoneNumber: args.from,
              });
              console.log("✅ Welcome message sent");
            } catch (error) {
              console.error("❌ Error sending welcome message:", error);
            }
          }
        } else {
            // Trigger AI for both text and media messages
            const isChatActive = await ctx.runQuery(internal.activeChatSessions.isLeadChatActive, { leadId });
            
            if (!isChatActive) {
                console.log(`🤖 Triggering auto-reply for lead ${leadId} (chat not active, type: ${args.type})`);
                
                const allMessages = await ctx.runQuery(internal.whatsappQueries.getChatMessagesInternal, { leadId });
                const contextMessages = allMessages.slice(-5).map((m: any) => ({
                    role: m.direction === "outbound" ? "assistant" : "user",
                    content: m.content || (m.messageType ? `[${m.messageType}]` : "[media]")
                }));

                const contactRequestMessage = await ctx.runQuery(internal.whatsappConfig.getContactRequestMessage);

                // Build a meaningful prompt for media messages
                let prompt = args.text;
                if (args.type !== "text" || !args.text) {
                    const mediaTypeLabel: Record<string, string> = {
                        image: "an image",
                        document: "a document",
                        video: "a video",
                        audio: "a voice message / audio",
                        sticker: "a sticker",
                    };
                    const label = mediaTypeLabel[args.type] || "a media file";
                    const filename = args.mediaFilename ? ` (${args.mediaFilename})` : "";
                    prompt = args.text
                        ? `${args.text} [User also sent ${label}${filename}]`
                        : `[User sent ${label}${filename}]`;
                }

                await ctx.runAction(internal.whatsappAi.generateAndSendAiReplyInternal, {
                        leadId,
                        phoneNumber: args.from,
                        context: { 
                            recentMessages: contextMessages,
                            contactRequestMessage 
                        },
                        prompt,
                        isAutoReply: true
                });
                console.log("✅ Auto-reply sent");
            } else {
                console.log(`⏭️ Skipping auto-reply for lead ${leadId} (chat is actively being viewed)`);
            }
        }

        console.log(`✅ Successfully processed incoming message from ${args.from} for lead ${leadId}`);
      }
    } catch (error) {
      console.error("❌ Error handling incoming message:", error);
      throw error;
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
      console.log(`📊 Status update: ${args.messageId} -> ${args.status}`);
      await ctx.runMutation(internal.whatsappMutations.updateMessageStatus, {
        externalId: args.messageId,
        status: args.status,
      });
      console.log(`✅ Updated message ${args.messageId} to status: ${args.status}`);
    } catch (error) {
      console.error("❌ Error handling status update:", error);
    }
  },
});