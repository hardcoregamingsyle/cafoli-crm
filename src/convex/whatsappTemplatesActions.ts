"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

// Send welcome messages to leads created in the past 150 hours that haven't received it
export const sendWelcomeToRecentLeads = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; leadsProcessed: number; messagesSent: number; errors: number }> => {
    const now = Date.now();
    const cutoffTime = now - (150 * 60 * 60 * 1000); // 150 hours ago
    
    // Get all leads created in the past 150 hours
    const allLeads: Doc<"leads">[] = await ctx.runQuery(internal.whatsappMutations.getLeadsForMatching);
    const recentLeads: Doc<"leads">[] = allLeads.filter((lead: Doc<"leads">) => lead._creationTime >= cutoffTime);
    
    let sentCount = 0;
    let errorCount = 0;
    
    for (const lead of recentLeads) {
      // Check if welcome message was already sent to this lead
      const existingChats = await ctx.runQuery(internal.whatsappQueries.getChatsByLeadId, {
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
            await ctx.runAction(internal.whatsappTemplates.sendWelcomeMessage, {
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
            await ctx.runAction(internal.whatsappTemplates.sendWelcomeMessage, {
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
