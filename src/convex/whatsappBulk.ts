"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured. Please set CLOUD_API_ACCESS_TOKEN and WA_PHONE_NUMBER_ID.");
    }

    const results = {
      total: args.contacts.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ phone: string; error: string }>,
    };

    const language = args.templateLanguage || "en_US";

    for (const contact of args.contacts) {
      try {
        const phone = contact.phoneNumber.replace(/\D/g, "");
        if (!phone) {
          results.failed++;
          results.errors.push({ phone: contact.phoneNumber, error: "Invalid phone number" });
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
          results.failed++;
          results.errors.push({
            phone,
            error: data?.error?.message || `API error ${response.status}`,
          });
          continue;
        }

        results.sent++;

        // Track in DB
        await ctx.scheduler.runAfter(0, internal.whatsappBulk.trackBulkContact, {
          adminId: args.adminId,
          phoneNumber: phone,
          name: contact.name,
          templateId: args.templateName,
          externalMessageId: data.messages?.[0]?.id || "",
        });

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        results.failed++;
        results.errors.push({
          phone: contact.phoneNumber,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  },
});

export const trackBulkContact = internalAction({
  args: {
    adminId: v.id("users"),
    phoneNumber: v.string(),
    name: v.optional(v.string()),
    templateId: v.string(),
    externalMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.bulkMessaging.insertBulkContact, {
      adminId: args.adminId,
      phoneNumber: args.phoneNumber,
      name: args.name,
      templateId: args.templateId,
      externalMessageId: args.externalMessageId,
    });
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