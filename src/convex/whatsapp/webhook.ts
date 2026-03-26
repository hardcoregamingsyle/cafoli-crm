"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

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
        // Download incoming media and store in Convex storage
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
              
              // Store in Convex storage and get a signed URL for display
              const storageId = await ctx.storage.store(fileBlob);
              mediaUrl = await ctx.storage.getUrl(storageId);
              console.log("✅ Incoming media stored in Convex:", storageId);
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

        if (isNewLead) {
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
        } else {
            if (args.type === "text") {
                const isChatActive = await ctx.runQuery(internal.activeChatSessions.isLeadChatActive, { leadId });
                
                if (!isChatActive) {
                    console.log(`🤖 Triggering auto-reply for lead ${leadId} (chat not active)`);
                    
                    const allMessages = await ctx.runQuery(internal.whatsappQueries.getChatMessagesInternal, { leadId });
                    const contextMessages = allMessages.slice(-5).map((m: any) => ({
                        role: m.direction === "outbound" ? "assistant" : "user",
                        content: m.content
                    }));

                    const contactRequestMessage = await ctx.runQuery(internal.whatsappConfig.getContactRequestMessage);

                    await ctx.runAction(internal.whatsappAi.generateAndSendAiReplyInternal, {
                            leadId,
                            phoneNumber: args.from,
                            context: { 
                                recentMessages: contextMessages,
                                contactRequestMessage 
                            },
                            prompt: args.text,
                            isAutoReply: true
                    });
                    console.log("✅ Auto-reply sent");
                } else {
                    console.log(`⏭️ Skipping auto-reply for lead ${leadId} (chat is actively being viewed)`);
                }
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