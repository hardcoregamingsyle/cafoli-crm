"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

export const processBulkTemplateChunk = action({
  args: {
    contacts: v.array(v.object({
      phoneNumber: v.string(),
      name: v.optional(v.string()),
    })),
    templateName: v.string(),
    templateLanguage: v.optional(v.string()),
    adminId: v.id("users"),
    processId: v.string(),
  },
  handler: async (ctx, args) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured.");
    }

    const CHUNK_SIZE = 50;
    const currentChunk = args.contacts.slice(0, CHUNK_SIZE);
    const remainingContacts = args.contacts.slice(CHUNK_SIZE);

    let sent = 0;
    let failed = 0;
    const language = args.templateLanguage || "en_US";

    try {
      for (const contact of currentChunk) {
        try {
          const rawPhone = contact.phoneNumber.replace(/\D/g, "");
          if (!rawPhone) {
            failed++;
            continue;
          }

          // Standardize to 12-digit for WhatsApp API (91XXXXXXXXXX)
          const phone = rawPhone.length === 10 ? "91" + rawPhone : rawPhone;

          const response = await fetch(
            `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: phone,
                type: "template",
                template: {
                  name: args.templateName,
                  language: { code: language },
                },
              }),
            }
          );

          const data = await response.json() as any;

          if (!response.ok) {
            failed++;
            continue;
          }

          sent++;

          // Track in DB — store as 12-digit to match lead format
          await ctx.runMutation(internal.bulkMessaging.insertBulkContact, {
            adminId: args.adminId,
            phoneNumber: phone,
            name: contact.name,
            templateId: args.templateName,
            externalMessageId: data.messages?.[0]?.id || "",
          });

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (error) {
          failed++;
        }
      }

      const isComplete = remainingContacts.length === 0;

      await ctx.runMutation(internal.bulkMessaging.updateBatchProgress, {
        processId: args.processId,
        processed: sent,
        failed: failed,
        isComplete,
      });

      if (!isComplete) {
        await ctx.scheduler.runAfter(0, api.whatsappBulk.processBulkTemplateChunk, {
          contacts: remainingContacts,
          templateName: args.templateName,
          templateLanguage: args.templateLanguage,
          adminId: args.adminId,
          processId: args.processId,
        });
      }
    } catch (error) {
      console.error("Batch chunk processing failed:", error);
      await ctx.runMutation(internal.bulkMessaging.updateBatchProgress, {
        processId: args.processId,
        processed: sent,
        failed: currentChunk.length - sent + remainingContacts.length,
        isComplete: true,
      });
    }
  }
});

export const sendBulkTemplateMessages = action({
  args: {
    contacts: v.array(v.object({
      phoneNumber: v.string(),
      name: v.optional(v.string()),
    })),
    templateName: v.string(),
    templateLanguage: v.optional(v.string()),
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const processId = `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    await ctx.runMutation(internal.bulkMessaging.initBatch, {
      processId,
      total: args.contacts.length,
    });

    await ctx.scheduler.runAfter(0, api.whatsappBulk.processBulkTemplateChunk, {
      contacts: args.contacts,
      templateName: args.templateName,
      templateLanguage: args.templateLanguage,
      adminId: args.adminId,
      processId,
    });

    return { processId, total: args.contacts.length };
  },
});

export const sendBulkWhatsAppMessages = action({
  args: {
    leadIds: v.array(v.id("leads")),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured.");
    }

    const results = {
      total: args.leadIds.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ leadId: string; error: string }>,
    };

    for (const leadId of args.leadIds) {
      try {
        const lead = await ctx.runQuery("whatsappMutations:getLeadsForMatching" as any, {});
        const targetLead = lead.find((l: any) => l._id === leadId);

        if (!targetLead || !targetLead.mobile) {
          results.failed++;
          results.errors.push({ leadId, error: "Lead not found or missing mobile number" });
          continue;
        }

        const response = await fetch(
          `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: targetLead.mobile,
              type: "text",
              text: { body: args.message },
            }),
          }
        );

        const data = await response.json() as any;

        if (!response.ok) {
          results.failed++;
          results.errors.push({ leadId, error: `WhatsApp API error: ${JSON.stringify(data)}` });
          continue;
        }

        await ctx.runMutation("whatsappMutations:storeMessage" as any, {
          leadId,
          phoneNumber: targetLead.mobile,
          content: args.message,
          direction: "outbound",
          status: "sent",
          externalId: data.messages?.[0]?.id || "",
        });

        results.sent++;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        results.failed++;
        results.errors.push({
          leadId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  },
});