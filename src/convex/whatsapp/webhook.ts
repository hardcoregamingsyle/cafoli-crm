"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

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
            // @ts-ignore
            await ctx.runAction(internal.whatsapp.internal.sendWelcomeMessage, {
              leadId,
              phoneNumber: args.from,
            });
          } catch (error) {
            console.error("Error sending welcome message:", error);
          }
        } else {
            // TRIGGER AUTO REPLY FOR EXISTING LEADS - BUT ONLY IF CHAT IS NOT ACTIVE
            if (args.type === "text") {
                // Check if someone is actively viewing this chat
                const isChatActive = await ctx.runQuery(api.activeChatSessions.isLeadChatActive, { leadId });
                
                if (!isChatActive) {
                    console.log(`Triggering auto-reply for lead ${leadId} (chat not active)`);
                    
                    const recentMessages = await ctx.runQuery(api.whatsappQueries.getChatMessages, { leadId });
                    const contextMessages = recentMessages.slice(-5).map((m: any) => ({
                        role: m.direction === "outbound" ? "assistant" : "user",
                        content: m.content
                    }));

                    // Get configurable contact request message
                    const contactRequestMessage = await ctx.runQuery(api.whatsappConfig.getContactRequestMessage);

                    // Cast to any to avoid circular dependency type issues during generation
                    const whatsappAi = (api as any).whatsappAi;
                    if (whatsappAi?.generateAndSendAiReply) {
                        await ctx.runAction(whatsappAi.generateAndSendAiReply, {
                            leadId,
                            phoneNumber: args.from,
                            context: { 
                                recentMessages: contextMessages,
                                contactRequestMessage 
                            },
                            prompt: args.text,
                            isAutoReply: true
                        });
                    } else {
                        console.error("Could not find whatsappAi.generateAndSendAiReply action");
                    }
                } else {
                    console.log(`Skipping auto-reply for lead ${leadId} (chat is actively being viewed)`);
                }
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
