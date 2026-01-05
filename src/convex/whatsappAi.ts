"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Doc, Id } from "./_generated/dataModel";

// Helper to strip markdown code blocks from JSON
function extractJsonFromMarkdown(text: string): string {
  // Try to find JSON inside markdown code blocks
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = text.match(jsonBlockRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  // fallback: return entire text if no code block found
  return text;
}

export const generateAndSendAiReply = action({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
    prompt: v.string(),
    context: v.any(),
    userId: v.optional(v.id("users")),
    replyingToMessageId: v.optional(v.id("messages")),
    replyingToExternalId: v.optional(v.string()),
    isAutoReply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      console.error("Gemini API key not configured");
      return;
    }

    try {
      // Fetch available resources for context
      const products = await ctx.runQuery(api.products.listProducts);
      const rangePdfs = await ctx.runQuery(api.rangePdfs.listRangePdfs);

      const productNames = products.map((p: any) => p.name).join(", ");
      const pdfNames = rangePdfs.map((p: any) => p.name).join(", ");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const systemPrompt = `You are a helpful CRM assistant for a pharmaceutical company.
      You are chatting with a lead on WhatsApp.
      
      Available Products: ${productNames}
      Available Range PDFs: ${pdfNames}
      
      Your goal is to assist the lead, answer questions, and provide product information.
      
      You can perform the following actions by returning a JSON object:
      1. Reply with text: { "action": "reply", "text": "your message" }
      2. Send a product image: { "action": "send_image", "text": "optional caption", "resource_name": "exact product name" }
      3. Send a PDF: { "action": "send_pdf", "text": "optional caption", "resource_name": "exact pdf name" }
      4. Request human intervention (if you can't help): { "action": "intervention_request", "text": "I will connect you with an agent.", "reason": "reason" }
      5. Request contact (if they want a meeting/call): { "action": "contact_request", "text": "I've noted your request.", "reason": "reason" }
      
      Always return ONLY the JSON object. Do not include other text.
      `;

      const chatContext = JSON.stringify(args.context);
      const userPrompt = `Context: ${chatContext}\n\nUser Message: ${args.prompt}`;

      const result = await model.generateContent([systemPrompt, userPrompt]);
      const response = result.response;
      const text = response.text();
      
      const jsonStr = extractJsonFromMarkdown(text);
      let aiAction;
      try {
        aiAction = JSON.parse(jsonStr);
      } catch (e) {
        console.error("Failed to parse AI response as JSON", text);
        // Fallback to text reply
        aiAction = { action: "reply", text: text };
      }

      console.log("AI Action:", aiAction);

      // Execute Action
      if (aiAction.action === "reply") {
        await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          message: aiAction.text,
          quotedMessageId: args.replyingToMessageId,
          quotedMessageExternalId: args.replyingToExternalId,
        });
      } else if (aiAction.action === "send_image") {
        const product = products.find((p: any) => p.name === aiAction.resource_name);
        if (product && product.images && product.images.length > 0) {
           const storageId = product.images[0];
           // Get metadata for mime type
           const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId });
           
           await ctx.runAction(api.whatsapp.sendWhatsAppMedia, {
             leadId: args.leadId,
             phoneNumber: args.phoneNumber,
             storageId: storageId,
             fileName: `${product.name}.jpg`, 
             mimeType: metadata?.contentType || "image/jpeg",
             message: aiAction.text
           });
        } else {
           await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
             leadId: args.leadId,
             phoneNumber: args.phoneNumber,
             message: `I couldn't find the image for ${aiAction.resource_name}. ${aiAction.text}`,
           });
        }
      } else if (aiAction.action === "send_pdf") {
         const pdf = rangePdfs.find((p: any) => p.name === aiAction.resource_name);
         if (pdf) {
           const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: pdf.storageId });
           
           await ctx.runAction(api.whatsapp.sendWhatsAppMedia, {
             leadId: args.leadId,
             phoneNumber: args.phoneNumber,
             storageId: pdf.storageId,
             fileName: `${pdf.name}.pdf`,
             mimeType: metadata?.contentType || "application/pdf",
             message: aiAction.text
           });
         } else {
            await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
             leadId: args.leadId,
             phoneNumber: args.phoneNumber,
             message: `I couldn't find the PDF for ${aiAction.resource_name}. ${aiAction.text}`,
           });
         }
      } else if (aiAction.action === "intervention_request") {
          await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: aiAction.text,
          });
          // Try to create intervention request if module exists
          try {
            // @ts-ignore
            if (api.interventionRequests && api.interventionRequests.create) {
                // @ts-ignore
                await ctx.runMutation(api.interventionRequests.create, { 
                    leadId: args.leadId, 
                    reason: aiAction.reason || "AI Request",
                    status: "pending"
                });
            }
          } catch (e) {
              console.error("Failed to create intervention request", e);
          }
      } else if (aiAction.action === "contact_request") {
          await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: aiAction.text,
          });
          // Try to create contact request if module exists
          try {
            // @ts-ignore
            if (api.contactRequests && api.contactRequests.create) {
                // @ts-ignore
                await ctx.runMutation(api.contactRequests.create, { 
                    leadId: args.leadId, 
                    type: "general",
                    status: "pending",
                    notes: aiAction.reason
                });
            }
          } catch (e) {
              console.error("Failed to create contact request", e);
          }
      }

    } catch (error) {
      console.error("AI Generation Error", error);
      await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          message: "I'm having trouble processing your request right now. Please try again later.",
      });
    }
  }
});