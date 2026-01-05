"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Helper function to send template message with variable substitution
async function sendTemplateMessageHelper(
  phoneNumber: string,
  templateName: string,
  languageCode: string,
  leadId: string,
  ctx: any,
  variables?: Record<string, string>,
  mediaUrl?: string
) {
  const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  
  if (!accessToken || !phoneNumberId) {
    console.error("WhatsApp API configuration missing", {
      hasAccessToken: !!accessToken,
      hasPhoneNumberId: !!phoneNumberId
    });
    throw new Error("WhatsApp API not configured.");
  }

  // Validate phone number
  if (!phoneNumber || phoneNumber.trim() === "") {
    console.error("Template send failed: Phone number is empty", { leadId, templateName });
    throw new Error("Phone number is required to send template message.");
  }

  try {
    // Fetch the template from database to get its content
    const templates = await ctx.runQuery("whatsappTemplatesQueries:getTemplates" as any);
    const template = templates.find((t: any) => 
      t.name === templateName && t.language === languageCode
    );

    if (!template) {
      console.error("Template not found in database", { templateName, languageCode });
      throw new Error(`Template ${templateName} (${languageCode}) not found. Please sync templates first.`);
    }

    // Prepare components for the API call
    const components: any[] = [];

    // 1. Handle Header Component
    const headerComponent = template.components?.find((c: any) => c.type === "HEADER");
    if (headerComponent) {
      if (headerComponent.format === "IMAGE") {
        const imageUrl = mediaUrl || variables?.headerUrl || "https://placehold.co/600x400.png?text=Welcome";
        components.push({
          type: "header",
          parameters: [{
            type: "image",
            image: { link: imageUrl }
          }]
        });
      } else if (headerComponent.format === "DOCUMENT") {
        const docUrl = mediaUrl || variables?.headerUrl;
        if (docUrl) {
          components.push({
            type: "header",
            parameters: [{
              type: "document",
              document: { link: docUrl }
            }]
          });
        }
      } else if (headerComponent.format === "VIDEO") {
        const videoUrl = mediaUrl || variables?.headerUrl;
        if (videoUrl) {
          components.push({
            type: "header",
            parameters: [{
              type: "video",
              video: { link: videoUrl }
            }]
          });
        }
      }
    }

    // 2. Handle Body Component (Variables)
    // If variables are provided, we assume they map to {{1}}, {{2}}, etc. based on keys "1", "2"...
    // Or if the user passed named variables, we might need to map them if the template uses named params (not standard in WhatsApp API, usually positional)
    // For now, we'll only add body params if variables has numeric keys matching the expected count, or if we want to support it later.
    // The current implementation does local substitution for storage but didn't send params to API.
    // We will leave body params logic for now unless requested, to avoid breaking changes, 
    // but we MUST send the components array if we added a header.

    // Get lead data for variable substitution
    const lead = await ctx.runQuery("whatsappTemplatesQueries:getLeadForTemplate" as any, {
      leadId: leadId,
    });

    console.log(`Sending template ${templateName} to ${phoneNumber} for lead ${leadId}`);

    const payload: any = {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
      },
    };

    if (components.length > 0) {
      payload.template.components = components;
    }

    const response = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error("WhatsApp API error response", {
        status: response.status,
        data: data,
        phoneNumber,
        templateName
      });
      throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
    }

    // Extract template content from components and substitute variables
    let templateContent = `Template: ${templateName}`;
    if (template && template.components) {
      const bodyComponent = template.components.find((c: any) => c.type === "BODY");
      if (bodyComponent && bodyComponent.text) {
        templateContent = bodyComponent.text;
        
        // Substitute variables if lead data is available
        if (lead) {
          templateContent = templateContent
            .replace(/\{\{1\}\}/g, lead.name || "")
            .replace(/\{\{name\}\}/gi, lead.name || "")
            .replace(/\{\{company\}\}/gi, lead.agencyName || lead.company || "")
            .replace(/\{\{subject\}\}/gi, lead.subject || "");
        }
        
        // Apply custom variables if provided
        if (variables) {
          Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
            templateContent = templateContent.replace(regex, value);
          });
        }
      }
    }

    // Store message in database with actual template content
    await ctx.runMutation("whatsappMutations:storeMessage" as any, {
      leadId: leadId,
      phoneNumber: phoneNumber,
      content: templateContent,
      direction: "outbound",
      status: "sent",
      externalId: data.messages?.[0]?.id || "",
    });

    console.log(`Template message sent successfully`, {
      messageId: data.messages?.[0]?.id,
      phoneNumber,
      templateName
    });

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error("Template send error - Full details:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      phoneNumber,
      templateName,
      languageCode,
      leadId
    });
    throw new Error(`Failed to send template: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Sync templates from Meta WhatsApp Business API
export const syncTemplates = action({
  args: {},
  handler: async (ctx) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const businessAccountId = process.env.WA_BUSINESS_ACCOUNT_ID;
    
    console.log("Environment check:", {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length || 0,
      accessTokenValue: accessToken ? `${accessToken.substring(0, 10)}...` : "undefined",
      hasBusinessAccountId: !!businessAccountId,
      businessAccountIdLength: businessAccountId?.length || 0,
      businessAccountIdValue: businessAccountId || "undefined",
      allEnvKeys: Object.keys(process.env).filter(k => k.includes("WA_") || k.includes("CLOUD_")),
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
        `https://graph.facebook.com/v20.0/${businessAccountId}/message_templates`,
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
        await ctx.runMutation("whatsappTemplatesMutations:upsertTemplate" as any, {
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
      accessTokenValue: accessToken ? `${accessToken.substring(0, 10)}...` : "undefined",
      hasBusinessAccountId: !!businessAccountId,
      businessAccountIdLength: businessAccountId?.length || 0,
      businessAccountIdValue: businessAccountId || "undefined",
      allEnvKeys: Object.keys(process.env).filter(k => k.includes("WA_") || k.includes("CLOUD_")),
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
        `https://graph.facebook.com/v20.0/${businessAccountId}/message_templates`,
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
      await ctx.runMutation("whatsappTemplatesMutations:upsertTemplate" as any, {
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

// Delete a template from Meta API and database
export const deleteTemplate = action({
  args: {
    templateName: v.string(),
    templateId: v.id("templates"),
  },
  handler: async (ctx, args) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const businessAccountId = process.env.WA_BUSINESS_ACCOUNT_ID;
    
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("CLOUD_API_ACCESS_TOKEN is not set or is empty.");
    }
    
    if (!businessAccountId || businessAccountId.trim() === "") {
      throw new Error("WA_BUSINESS_ACCOUNT_ID is not set or is empty.");
    }

    try {
      // Delete from Meta API
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${businessAccountId}/message_templates?name=${args.templateName}`,
        {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        console.error("Meta API delete error:", data);
        throw new Error(`Meta API error: ${JSON.stringify(data)}`);
      }

      // Delete from database
      await ctx.runMutation("whatsappTemplatesMutations:deleteTemplate" as any, {
        templateId: args.templateId,
      });

      return { success: true };
    } catch (error) {
      console.error("Template deletion error:", error);
      throw new Error(`Failed to delete template: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});

// Send a template message to a contact
export const sendTemplateMessage = action({
  args: {
    phoneNumber: v.string(),
    templateName: v.string(),
    languageCode: v.string(),
    leadId: v.id("leads"),
    variables: v.optional(v.record(v.string(), v.string())),
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await sendTemplateMessageHelper(
      args.phoneNumber,
      args.templateName,
      args.languageCode,
      args.leadId,
      ctx,
      args.variables,
      args.mediaUrl
    );
  },
});

// Internal action to send welcome message
export const sendWelcomeMessage = internalAction({
  args: {
    phoneNumber: v.string(),
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    // Step 1: Ensure WhatsApp chat/contact exists for this lead
    await ctx.runMutation(internal.whatsappMutations.ensureChatExists, {
      leadId: args.leadId,
      phoneNumber: args.phoneNumber,
    });

    // Step 2: Send the welcome message template
    // We pass a default image URL because the template likely requires an IMAGE header
    return await sendTemplateMessageHelper(
      args.phoneNumber,
      "cafoliwelcomemessage",
      "en",
      args.leadId,
      ctx,
      undefined,
      "https://placehold.co/600x400.png?text=Welcome+to+Cafoli" // Default welcome image
    );
  },
});