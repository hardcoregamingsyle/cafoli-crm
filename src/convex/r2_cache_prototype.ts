import { mutation, query, internalMutation, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const getR2TestLeads = internalQuery({
  args: {},
  handler: async (ctx): Promise<any[]> => {
    return await ctx.db.query("leads").withIndex("by_source", q => q.eq("source", "R2 Test")).take(1000);
  }
});

export const generateMessagesBatch = internalMutation({
  args: { leadId: v.id("leads"), count: v.number() },
  handler: async (ctx, args): Promise<void> => {
    let chat = await ctx.db.query("chats").withIndex("by_lead", q => q.eq("leadId", args.leadId)).first();
    if (!chat) {
      const chatId = await ctx.db.insert("chats", {
        leadId: args.leadId,
        unreadCount: 0,
        lastMessageAt: Date.now(),
        platform: "whatsapp",
      });
      chat = await ctx.db.get(chatId);
    }

    for (let i = 0; i < args.count; i++) {
      const isOutbound = i % 2 === 0;
      await ctx.db.insert("messages", {
        chatId: chat!._id,
        direction: isOutbound ? "outbound" : "inbound",
        content: `Test message ${i} for durability testing. This simulates a long conversation to test speed and reliability.`,
        messageType: "text",
        status: isOutbound ? "delivered" : "received",
      });
    }
    
    await ctx.db.patch(chat!._id, { lastMessageAt: Date.now() });
  }
});

export const triggerMassiveConversations = action({
  args: { messagesPerLead: v.number() },
  handler: async (ctx, args): Promise<string> => {
    const leads = (await ctx.runQuery(internal.r2_cache_prototype.getR2TestLeads as any)) as any[];
    let delay = 0;
    for (const lead of leads) {
      let remaining = args.messagesPerLead;
      while (remaining > 0) {
        const batchSize = Math.min(remaining, 500);
        await ctx.scheduler.runAfter(delay, internal.r2_cache_prototype.generateMessagesBatch, {
          leadId: lead._id,
          count: batchSize
        });
        remaining -= batchSize;
        delay += 200; // stagger by 200ms to avoid overwhelming the database
      }
    }
    return `Scheduled generation of ${args.messagesPerLead} messages for ${leads.length} leads.`;
  }
});

export const generateTestLeads = mutation({
  args: {},
  handler: async (ctx) => {
    const leads = [];
    for (let i = 1; i <= 150; i++) {
      const leadId = await ctx.db.insert("leads", {
        name: `R2 Test Lead ${i}`,
        mobile: `919999999${i.toString().padStart(3, '0')}`,
        status: "Cold",
        type: "To be Decided",
        lastActivity: Date.now(),
        source: "R2 Test",
      });
      leads.push(leadId);
    }
    return `Generated ${leads.length} test leads.`;
  }
});

export const offloadToR2 = mutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    // Find leads to offload (e.g., oldest activity)
    const leadsToOffload = await ctx.db
      .query("leads")
      .withIndex("by_source_and_last_activity", q => q.eq("source", "R2 Test"))
      .take(args.limit);

    let offloadedCount = 0;
    for (const lead of leadsToOffload) {
      // Save to mock R2
      await ctx.db.insert("r2_leads_mock", {
        originalId: lead._id,
        leadData: lead,
      });
      
      // Delete from Convex (RAM)
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
      delete data._id;
      delete data._creationTime;
      
      // Insert back to Convex
      await ctx.db.insert("leads", data);
      
      // Remove from R2 mock
      await ctx.db.delete(r2Lead._id);
      loadedCount++;
    }

    return `Loaded ${loadedCount} leads from R2 mock storage back to Convex.`;
  }
});

export const getR2Stats = query({
  args: {},
  handler: async (ctx) => {
    const convexLeads = await ctx.db
      .query("leads")
      .withIndex("by_source", q => q.eq("source", "R2 Test"))
      .take(1000);
      
    const r2Leads = await ctx.db.query("r2_leads_mock").take(1000);
    
    return {
      convexActiveCount: convexLeads.length,
      r2StorageCount: r2Leads.length,
    };
  }
});