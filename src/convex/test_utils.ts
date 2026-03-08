import { internalQuery, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const getAnyUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").first();
  }
});

export const deleteTestLeads = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    let count = 0;
    for (const lead of leads) {
      if (lead.name.startsWith("Test ")) {
        // Also delete associated chats and messages to be thorough
        const chats = await ctx.db.query("chats").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();
        for (const chat of chats) {
          const messages = await ctx.db.query("messages").withIndex("by_chat", q => q.eq("chatId", chat._id)).collect();
          for (const msg of messages) {
            await ctx.db.delete(msg._id);
          }
          await ctx.db.delete(chat._id);
        }
        
        // Delete associated comments
        const comments = await ctx.db.query("comments").withIndex("by_lead", q => q.eq("leadId", lead._id)).collect();
        for (const comment of comments) {
          await ctx.db.delete(comment._id);
        }

        await ctx.db.delete(lead._id);
        count++;
      }
    }
    return `Deleted ${count} test leads and their associated data.`;
  }
});

export const testIndiamartLeadProcessing = internalMutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const start = Date.now();
    const uniqueId = "TEST_QUERY_" + Date.now();
    const result = (await ctx.runMutation(internal.indiamartMutations.processIndiamartLead, {
      uniqueQueryId: uniqueId,
      name: "Test IndiaMART Lead",
      subject: "Test Subject",
      mobile: "9876543210",
      email: "test@example.com",
      message: "Test message",
      metadata: {
        queryTime: new Date().toISOString(),
        queryType: "W",
        mcatName: "Test Category",
        productName: "Test Product",
        countryIso: "IN",
      }
    })) as any;
    const end = Date.now();
    
    // Test deduplication by running it again
    const start2 = Date.now();
    const result2 = (await ctx.runMutation(internal.indiamartMutations.processIndiamartLead, {
      uniqueQueryId: uniqueId,
      name: "Test IndiaMART Lead Updated",
      subject: "Test Subject",
      mobile: "9876543210",
      email: "test@example.com",
      message: "Test message 2",
      metadata: {
        queryTime: new Date().toISOString(),
        queryType: "W",
        mcatName: "Test Category",
        productName: "Test Product",
        countryIso: "IN",
      }
    })) as any;
    const end2 = Date.now();

    return { 
      creation: { result, timeMs: end - start },
      deduplication: { result: result2, timeMs: end2 - start2 }
    };
  }
});

export const testWhatsAppLeadProcessing = internalMutation({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const start = Date.now();
    const phone = "919876543211";
    const result = (await ctx.runMutation(internal.whatsappMutations.processWhatsAppLead, {
      phoneNumber: phone,
      name: "Test WhatsApp Lead",
      message: "Test message",
    })) as any;
    const end = Date.now();

    // Test deduplication
    const start2 = Date.now();
    const result2 = (await ctx.runMutation(internal.whatsappMutations.processWhatsAppLead, {
      phoneNumber: phone,
      name: "Test WhatsApp Lead",
      message: "Test message 2",
    })) as any;
    const end2 = Date.now();

    return { 
      creation: { result, timeMs: end - start },
      deduplication: { result: result2, timeMs: end2 - start2 }
    };
  }
});

export const testProcessWhatsAppLeadPerformance = internalMutation({
  args: { iterations: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const times = [];
    for (let i = 0; i < args.iterations; i++) {
      const start = Date.now();
      await ctx.runMutation(internal.whatsappMutations.processWhatsAppLead, {
        phoneNumber: `9198765432${i % 10}`, // Mix of new and existing (10 unique numbers)
        name: `Test Lead ${i}`,
      });
      times.push(Date.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return { 
      iterations: args.iterations,
      avgTimeMs: avg, 
      maxTimeMs: Math.max(...times), 
      minTimeMs: Math.min(...times) 
    };
  }
});

export const prepareBaseR2Leads = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Load any offloaded leads back
    const r2Leads = await ctx.db.query("r2_leads_mock").take(1000);
    for (const r2Lead of r2Leads) {
      const data = r2Lead.leadData;
      delete data._id;
      delete data._creationTime;
      await ctx.db.insert("leads", data);
      await ctx.db.delete(r2Lead._id);
    }

    // Ensure we have exactly 150
    const currentLeads = await ctx.db.query("leads").withIndex("by_source", q => q.eq("source", "R2 Test")).take(1000);
    
    if (currentLeads.length < 150) {
      const needed = 150 - currentLeads.length;
      for (let i = 0; i < needed; i++) {
        await ctx.db.insert("leads", {
          name: `R2 Test Lead Extra ${i}`,
          mobile: `919999999${(i + 500).toString().padStart(3, '0')}`,
          status: "Cold",
          type: "To be Decided",
          lastActivity: Date.now(),
          source: "R2 Test",
        });
      }
    } else if (currentLeads.length > 150) {
      const excess = currentLeads.length - 150;
      for (let i = 0; i < excess; i++) {
        await ctx.db.delete(currentLeads[i]._id);
      }
    }
  }
});

export const verifyAndTestR2 = internalMutation({
  args: { sendTime: v.number() },
  handler: async (ctx, args): Promise<{
    sendTimeMs: number;
    verifyTimeMs: number;
    offloadTimeMs: number;
    loadTimeMs: number;
    totalTestLeadsFound: number;
    mismatchCount: number;
    loadedCount: number;
    success: boolean;
  }> => {
    const startVerify = Date.now();
    
    const originalR2Leads = await ctx.db.query("leads").withIndex("by_source", q => q.eq("source", "R2 Test")).take(1000);
    
    const webhookLeads = [];
    for (let i = 0; i < 75; i++) {
      const imMobile = `919999888${i.toString().padStart(3, '0')}`;
      const imLead = await ctx.db.query("leads").withIndex("by_mobile", q => q.eq("mobile", imMobile)).first();
      if (imLead && imLead.message === "R2_TEST_MESSAGE") webhookLeads.push(imLead);

      const waMobile = `919999777${i.toString().padStart(3, '0')}`;
      const waLead = await ctx.db.query("leads").withIndex("by_mobile", q => q.eq("mobile", waMobile)).first();
      if (waLead && waLead.message === "R2_TEST_MESSAGE") webhookLeads.push(waLead);
    }
    
    const allTestLeads = [...originalR2Leads, ...webhookLeads];

    const verifyTime = Date.now() - startVerify;

    // Offload to R2
    const startOffload = Date.now();
    const offloadedData = [];
    for (const lead of allTestLeads) {
      await ctx.db.insert("r2_leads_mock", {
        originalId: lead._id,
        leadData: lead,
      });
      await ctx.db.delete(lead._id);
      offloadedData.push(lead);
    }
    const offloadTime = Date.now() - startOffload;

    // Load from R2
    const startLoad = Date.now();
    const r2Leads = await ctx.db.query("r2_leads_mock").take(1000);
    
    let mismatchCount = 0;
    let loadedCount = 0;

    for (const r2Lead of r2Leads) {
      const original = offloadedData.find(l => l._id === r2Lead.originalId);
      if (original) {
        const data = r2Lead.leadData;
        delete data._id;
        delete data._creationTime;
        
        const newId = await ctx.db.insert("leads", data);
        const newlyInserted = await ctx.db.get(newId);
        
        // Check for mismatch
        let isMatch = true;
        for (const key of Object.keys(data)) {
          if (JSON.stringify(data[key]) !== JSON.stringify(newlyInserted![key as keyof typeof newlyInserted])) {
            isMatch = false;
          }
        }
        if (!isMatch) mismatchCount++;
        
        await ctx.db.delete(r2Lead._id);
        loadedCount++;
      }
    }
    const loadTime = Date.now() - startLoad;

    // Clean up webhook leads so they don't pollute the DB
    for (const lead of webhookLeads) {
      const reloadedLead = await ctx.db.query("leads").withIndex("by_mobile", q => q.eq("mobile", lead.mobile)).first();
      if (reloadedLead) {
        await ctx.db.delete(reloadedLead._id);
      }
    }

    return {
      sendTimeMs: args.sendTime,
      verifyTimeMs: verifyTime,
      offloadTimeMs: offloadTime,
      loadTimeMs: loadTime,
      totalTestLeadsFound: allTestLeads.length,
      mismatchCount,
      loadedCount,
      success: allTestLeads.length >= 300 && mismatchCount === 0
    };
  }
});

export const simulateWebhooksAndTestR2 = action({
  args: {},
  handler: async (ctx): Promise<{
    sendTimeMs: number;
    verifyTimeMs: number;
    offloadTimeMs: number;
    loadTimeMs: number;
    totalTestLeadsFound: number;
    mismatchCount: number;
    loadedCount: number;
    success: boolean;
  }> => {
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("CONVEX_SITE_URL not set");

    // 1. Ensure we have exactly 150 base R2 test leads in Convex
    await ctx.runMutation(internal.test_utils.prepareBaseR2Leads);

    const startSend = Date.now();
    const promises = [];

    // 75 IndiaMART leads
    for (let i = 0; i < 75; i++) {
      const payload = {
        CODE: 200,
        STATUS: "SUCCESS",
        RESPONSE: {
          UNIQUE_QUERY_ID: `R2_TEST_IM_${Date.now()}_${i}`,
          SENDER_NAME: `R2 Webhook IM Lead ${i}`,
          SUBJECT: "R2 Test Subject",
          SENDER_MOBILE: `919999888${i.toString().padStart(3, '0')}`,
          SENDER_EMAIL: `r2test${i}@example.com`,
          QUERY_MESSAGE: "R2_TEST_MESSAGE",
          QUERY_TIME: new Date().toISOString(),
          QUERY_TYPE: "W",
          QUERY_MCAT_NAME: "Test Category",
          QUERY_PRODUCT_NAME: "Test Product",
          SENDER_COUNTRY_ISO: "IN"
        }
      };
      promises.push(fetch(`${siteUrl}/webhooks/indiamart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }));
    }

    // 75 WhatsApp leads
    for (let i = 0; i < 75; i++) {
      const payload = {
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: `919999777${i.toString().padStart(3, '0')}`,
                id: `R2_TEST_WA_${Date.now()}_${i}`,
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: "text",
                text: { body: "R2_TEST_MESSAGE" }
              }],
              contacts: [{
                wa_id: `919999777${i.toString().padStart(3, '0')}`,
                profile: { name: `R2 Webhook WA Lead ${i}` }
              }]
            }
          }]
        }]
      };
      promises.push(fetch(`${siteUrl}/webhooks/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }));
    }

    await Promise.all(promises);
    const endSend = Date.now();
    const sendTime = endSend - startSend;

    // Wait a bit for webhooks to process
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify and Test R2
    const result = (await ctx.runMutation(internal.test_utils.verifyAndTestR2, {
      sendTime
    })) as any;

    return result;
  }
});