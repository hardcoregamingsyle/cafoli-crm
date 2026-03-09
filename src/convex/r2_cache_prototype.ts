import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export async function restoreLeadFromR2Core(ctx: any, r2Id: Id<"r2_leads_mock">) {
  const r2Lead = await ctx.db.get(r2Id);
  if (!r2Lead) return null;
  
  const data = r2Lead.leadData;
  let newLeadId;
  
  if (data.lead) {
    const leadData = data.lead;
    delete leadData._id;
    delete leadData._creationTime;
    newLeadId = await ctx.db.insert("leads", leadData);

    const idMap: Record<string, string> = { [r2Lead.originalId]: newLeadId };

    // Restore chats
    for (const chat of data.chats || []) {
      const oldChatId = chat._id;
      delete chat._id;
      delete chat._creationTime;
      chat.leadId = newLeadId;
      const newChatId = await ctx.db.insert("chats", chat);
      idMap[oldChatId] = newChatId;
    }

    // Restore messages
    const messages = (data.messages || []).sort((a: any, b: any) => a._creationTime - b._creationTime);
    for (const msg of messages) {
      const oldMsgId = msg._id;
      delete msg._id;
      delete msg._creationTime;
      msg.chatId = idMap[msg.chatId] || msg.chatId;
      if (msg.quotedMessageId) {
        msg.quotedMessageId = idMap[msg.quotedMessageId] || msg.quotedMessageId;
      }
      await ctx.db.insert("messages", msg);
    }

    // Restore comments
    for (const comment of data.comments || []) {
      delete comment._id;
      delete comment._creationTime;
      comment.leadId = newLeadId;
      await ctx.db.insert("comments", comment);
    }

    // Restore followups
    for (const followup of data.followups || []) {
      delete followup._id;
      delete followup._creationTime;
      followup.leadId = newLeadId;
      await ctx.db.insert("followups", followup);
    }
  } else {
    const leadData = data;
    delete leadData._id;
    delete leadData._creationTime;
    newLeadId = await ctx.db.insert("leads", leadData);
  }
  
  await ctx.db.delete(r2Lead._id);
  return newLeadId;
}

export const offloadToR2 = mutation({
  args: { limit: v.number(), daysInactive: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.daysInactive * 24 * 60 * 60 * 1000;
    const leadsToOffload = await ctx.db
      .query("leads")
      .withIndex("by_last_activity", q => q.lt("lastActivity", cutoff))
      .take(args.limit);

    let offloadedCount = 0;
    for (const lead of leadsToOffload) {
      // Fetch relational data
      const chats = await ctx.db.query("chats").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();
      const messages = [];
      for (const chat of chats) {
        const chatMessages = await ctx.db.query("messages").withIndex("by_chat", q => q.eq("chatId", chat._id)).collect();
        messages.push(...chatMessages);
      }
      const comments = await ctx.db.query("comments").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();
      const followups = await ctx.db.query("followups").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();

      const fullData = {
        lead,
        chats,
        messages,
        comments,
        followups
      };

      // Save to mock R2
      await ctx.db.insert("r2_leads_mock", {
        originalId: lead._id,
        leadData: fullData,
        mobile: lead.mobile,
        indiamartUniqueId: lead.indiamartUniqueId,
      });
      
      // Delete from Convex (RAM)
      for (const msg of messages) await ctx.db.delete(msg._id);
      for (const chat of chats) await ctx.db.delete(chat._id);
      for (const comment of comments) await ctx.db.delete(comment._id);
      for (const followup of followups) await ctx.db.delete(followup._id);
      await ctx.db.delete(lead._id);
      
      offloadedCount++;
    }

    return `Offloaded ${offloadedCount} leads to R2 mock storage.`;
  }
});

export const loadFromR2 = mutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const r2Leads = await ctx.db.query("r2_leads_mock").take(args.limit);
    
    let loadedCount = 0;
    for (const r2Lead of r2Leads) {
      const data = r2Lead.leadData;
      
      if (data.lead) {
        // It's the new format with relational data
        const leadData = data.lead;
        delete leadData._id;
        delete leadData._creationTime;
        const newLeadId = await ctx.db.insert("leads", leadData);

        const idMap: Record<string, string> = { [r2Lead.originalId]: newLeadId };

        // Restore chats
        for (const chat of data.chats || []) {
          const oldChatId = chat._id;
          delete chat._id;
          delete chat._creationTime;
          chat.leadId = newLeadId;
          const newChatId = await ctx.db.insert("chats", chat);
          idMap[oldChatId] = newChatId;
        }

        // Restore messages
        const messages = (data.messages || []).sort((a: any, b: any) => a._creationTime - b._creationTime);
        for (const msg of messages) {
          const oldMsgId = msg._id;
          delete msg._id;
          delete msg._creationTime;
          msg.chatId = idMap[msg.chatId] || msg.chatId;
          if (msg.quotedMessageId) {
            msg.quotedMessageId = idMap[msg.quotedMessageId] || msg.quotedMessageId;
          }
          const newMsgId = await ctx.db.insert("messages", msg);
          idMap[oldMsgId] = newMsgId;
        }

        // Restore comments
        for (const comment of data.comments || []) {
          delete comment._id;
          delete comment._creationTime;
          comment.leadId = newLeadId;
          await ctx.db.insert("comments", comment);
        }

        // Restore followups
        for (const followup of data.followups || []) {
          delete followup._id;
          delete followup._creationTime;
          followup.leadId = newLeadId;
          await ctx.db.insert("followups", followup);
        }
      } else {
        // Old format (just lead data)
        const leadData = data;
        delete leadData._id;
        delete leadData._creationTime;
        await ctx.db.insert("leads", leadData);
      }
      
      // Remove from R2 mock
      await ctx.db.delete(r2Lead._id);
      loadedCount++;
    }

    return `Loaded ${loadedCount} leads from R2 mock storage back to Convex.`;
  }
});

export const offloadSingleToR2 = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new Error("Lead not found");
    
    const chats = await ctx.db.query("chats").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();
    const messages = [];
    for (const chat of chats) {
      const chatMessages = await ctx.db.query("messages").withIndex("by_chat", q => q.eq("chatId", chat._id)).collect();
      messages.push(...chatMessages);
    }
    const comments = await ctx.db.query("comments").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();
    const followups = await ctx.db.query("followups").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();

    const fullData = {
      lead,
      chats,
      messages,
      comments,
      followups
    };

    await ctx.db.insert("r2_leads_mock", {
      originalId: lead._id,
      leadData: fullData,
      mobile: lead.mobile,
      indiamartUniqueId: lead.indiamartUniqueId,
    });
    
    for (const msg of messages) await ctx.db.delete(msg._id);
    for (const chat of chats) await ctx.db.delete(chat._id);
    for (const comment of comments) await ctx.db.delete(comment._id);
    for (const followup of followups) await ctx.db.delete(followup._id);
    await ctx.db.delete(lead._id);

    return `Offloaded lead ${lead.name} to R2.`;
  }
});

export const getR2Stats = query({
  args: {},
  handler: async (ctx) => {
    const convexLeads = await ctx.db.query("leads").take(5000);
    const r2Leads = await ctx.db.query("r2_leads_mock").take(5000);
    
    return {
      convexActiveCount: convexLeads.length,
      r2StorageCount: r2Leads.length,
    };
  }
});

export const autoOffloadToR2 = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Offload leads inactive for 30 days
    const daysInactive = 30;
    const cutoff = Date.now() - daysInactive * 24 * 60 * 60 * 1000;
    const leadsToOffload = await ctx.db
      .query("leads")
      .withIndex("by_last_activity", q => q.lt("lastActivity", cutoff))
      .take(100); // Process in batches of 100

    let offloadedCount = 0;
    for (const lead of leadsToOffload) {
      // Fetch relational data
      const chats = await ctx.db.query("chats").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();
      const messages = [];
      for (const chat of chats) {
        const chatMessages = await ctx.db.query("messages").withIndex("by_chat", q => q.eq("chatId", chat._id)).collect();
        messages.push(...chatMessages);
      }
      const comments = await ctx.db.query("comments").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();
      const followups = await ctx.db.query("followups").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();

      const fullData = {
        lead,
        chats,
        messages,
        comments,
        followups
      };

      // Save to mock R2
      await ctx.db.insert("r2_leads_mock", {
        originalId: lead._id,
        leadData: fullData,
        mobile: lead.mobile,
        indiamartUniqueId: lead.indiamartUniqueId,
      });
      
      // Delete from Convex (RAM)
      for (const msg of messages) await ctx.db.delete(msg._id);
      for (const chat of chats) await ctx.db.delete(chat._id);
      for (const comment of comments) await ctx.db.delete(comment._id);
      for (const followup of followups) await ctx.db.delete(followup._id);
      await ctx.db.delete(lead._id);
      
      offloadedCount++;
    }

    console.log(`Auto-offloaded ${offloadedCount} leads to R2.`);
  }
});