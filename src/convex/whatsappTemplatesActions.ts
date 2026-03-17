"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

// Send welcome messages to leads created in the past 150 hours that haven't received it
export const sendWelcomeToRecentLeads = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; leadsProcessed: number; messagesSent: number; errors: number }> => {
    const now = Date.now();
    const cutoffTime = now - (150 * 60 * 60 * 1000); // 150 hours ago
    
    // Get all leads created in the past 150 hours
    const allLeads: Doc<"leads">[] = await ctx.runQuery("whatsappMutations:getLeadsForMatching" as any);
    const recentLeads: Doc<"leads">[] = allLeads.filter((lead: Doc<"leads">) => lead._creationTime >= cutoffTime);
    
    let sentCount = 0;
    let errorCount = 0;
    
    for (const lead of recentLeads) {
      // Check if welcome message was already sent to this lead
      const existingChats = await ctx.runQuery("whatsappQueries:getChatsByLeadId" as any, {
        leadId: lead._id,
      });
      
      // If no chats exist or no messages with the welcome template, send it
      const hasWelcomeMessage = existingChats.some((chat: any) => 
        chat.messages?.some((msg: any) => 
          msg.content?.includes("[Template: cafoliwelcomemessage]")
        )
      );
      
      if (!hasWelcomeMessage) {
        // Send to primary mobile
        if (lead.mobile) {
          try {
            await ctx.runAction("whatsappTemplates:sendWelcomeMessage" as any, {
              phoneNumber: lead.mobile,
              leadId: lead._id,
            });
            sentCount++;
          } catch (error) {
            console.error(`Failed to send welcome message to ${lead.mobile}:`, error);
            errorCount++;
          }
        }
        
        // Send to alternate mobile if exists
        if (lead.altMobile) {
          try {
            await ctx.runAction("whatsappTemplates:sendWelcomeMessage" as any, {
              phoneNumber: lead.altMobile,
              leadId: lead._id,
            });
            sentCount++;
          } catch (error) {
            console.error(`Failed to send welcome message to ${lead.altMobile}:`, error);
            errorCount++;
          }
        }
      }
    }
    
    return {
      success: true,
      leadsProcessed: recentLeads.length,
      messagesSent: sentCount,
      errors: errorCount,
    };
  },
});

export const sendTemplateToLead = internalAction({
  args: {
    leadId: v.id("leads"),
    templateId: v.id("whatsappTemplates"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; messageId?: string }> => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured");
    }

    // Get lead and template
    const lead: any = await ctx.runQuery("whatsappTemplatesQueries:getLeadForTemplate" as any, {
      leadId: args.leadId,
    });

    const template: any = await ctx.runQuery("whatsappTemplatesQueries:getTemplate" as any, {
      templateId: args.templateId,
    });

    if (!lead || !template) {
      throw new Error("Lead or template not found");
    }

    // Replace variables
    let message: string = template.content;
    message = message.replace(/\{\{name\}\}/g, lead.name || "");
    message = message.replace(/\{\{company\}\}/g, lead.company || "");
    message = message.replace(/\{\{subject\}\}/g, lead.subject || "");

    // Send via WhatsApp API
    const response: Response = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: lead.mobile,
          type: "text",
          text: { body: message },
        }),
      }
    );

    const data: any = await response.json();

    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
    }

    // Store message
    await ctx.runMutation("whatsappMutations:storeMessage" as any, {
      leadId: args.leadId,
      phoneNumber: lead.mobile,
      content: message,
      direction: "outbound",
      status: "sent",
      externalId: data.messages?.[0]?.id || "",
      templateName: template.name,
    });

    return { success: true, messageId: data.messages?.[0]?.id };
  },
});