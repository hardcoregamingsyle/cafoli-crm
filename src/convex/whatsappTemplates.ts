"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Sync templates from Meta WhatsApp Business API
export const syncTemplates = action({
  args: {},
  handler: async (ctx) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const businessAccountId = process.env.WA_BUSINESS_ACCOUNT_ID;
    
    console.log("Environment check:", {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length || 0,
      hasBusinessAccountId: !!businessAccountId,
      businessAccountIdLength: businessAccountId?.length || 0,
    });
    
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("CLOUD_API_ACCESS_TOKEN is not set or is empty. Please configure it in Convex backend environment variables.");
    }
    
    if (!businessAccountId || businessAccountId.trim() === "") {
      throw new Error("WA_BUSINESS_ACCOUNT_ID is not set or is empty. Please configure it in Convex backend environment variables.");
    }

    try {
      // Fetch templates from Meta API
      const response = await fetch(
        `https://graph.facebook.com/v16.0/${businessAccountId}/message_templates`,
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        console.error("Meta API error response:", data);
        throw new Error(`Meta API error: ${JSON.stringify(data)}`);
      }

      // Store templates in database
      const templates = data.data || [];
      
      for (const template of templates) {
        await ctx.runMutation(internal.whatsappTemplatesMutations.upsertTemplate, {
          name: template.name,
          language: template.language,
          category: template.category,
          status: template.status,
          externalId: template.id,
          components: template.components.map((comp: any) => ({
            type: comp.type,
            format: comp.format,
            text: comp.text,
            buttons: comp.buttons?.map((btn: any) => ({
              type: btn.type,
              text: btn.text,
              url: btn.url,
              phoneNumber: btn.phone_number,
            })),
          })),
        });
      }

      return { success: true, count: templates.length };
    } catch (error) {
      console.error("Template sync error:", error);
      throw new Error(`Failed to sync templates: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});

// Create a new template via Meta API
export const createTemplate = action({
  args: {
    name: v.string(),
    language: v.string(),
    category: v.string(),
    components: v.array(v.object({
      type: v.string(),
      format: v.optional(v.string()),
      text: v.optional(v.string()),
      buttons: v.optional(v.array(v.object({
        type: v.string(),
        text: v.string(),
        url: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
      }))),
    })),
  },
  handler: async (ctx, args) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const businessAccountId = process.env.WA_BUSINESS_ACCOUNT_ID;
    
    console.log("Create template environment check:", {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length || 0,
      hasBusinessAccountId: !!businessAccountId,
      businessAccountIdLength: businessAccountId?.length || 0,
    });
    
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("CLOUD_API_ACCESS_TOKEN is not set or is empty. Please configure it in Convex backend environment variables.");
    }
    
    if (!businessAccountId || businessAccountId.trim() === "") {
      throw new Error("WA_BUSINESS_ACCOUNT_ID is not set or is empty. Please configure it in Convex backend environment variables.");
    }

    try {
      // Create template via Meta API
      const response = await fetch(
        `https://graph.facebook.com/v16.0/${businessAccountId}/message_templates`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: args.name,
            language: args.language,
            category: args.category,
            components: args.components.map(comp => ({
              type: comp.type,
              format: comp.format,
              text: comp.text,
              buttons: comp.buttons?.map(btn => ({
                type: btn.type,
                text: btn.text,
                url: btn.url,
                phone_number: btn.phoneNumber,
              })),
            })),
          }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        console.error("Meta API error response:", data);
        throw new Error(`Meta API error: ${JSON.stringify(data)}`);
      }

      // Store in database
      await ctx.runMutation(internal.whatsappTemplatesMutations.upsertTemplate, {
        name: args.name,
        language: args.language,
        category: args.category,
        status: "PENDING",
        externalId: data.id,
        components: args.components,
      });

      return { success: true, templateId: data.id };
    } catch (error) {
      console.error("Template creation error:", error);
      throw new Error(`Failed to create template: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});