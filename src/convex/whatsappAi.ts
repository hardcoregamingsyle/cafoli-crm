"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateWithGemini, extractJsonFromMarkdown } from "./lib/gemini";

// Public wrapper for frontend to call
export const generateAndSendAiReply: any = action({
  args: {
    prompt: v.string(),
    context: v.object({
      leadName: v.string(),
      recentMessages: v.array(v.object({
        role: v.string(),
        content: v.string(),
      })),
    }),
    userId: v.id("users"),
    leadId: v.id("leads"),
    phoneNumber: v.string(),
    replyingToMessageId: v.optional(v.id("messages")),
    replyingToExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.whatsappAi.generateAndSendAiReplyInternal, args);
  },
});

// Internal action that does the actual work
export const generateAndSendAiReplyInternal = internalAction({
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
    try {
      // Fetch available resources for context
      const products = await ctx.runQuery(internal.products.listProductsInternal);
      const rangePdfs = await ctx.runQuery(internal.rangePdfs.listRangePdfsInternal);

      const productNames = products.map((p: any) => p.name).join(", ");
      const pdfNames = rangePdfs.map((p: any) => p.name).join(", ");

      const systemPrompt = `You are a helpful CRM assistant for a pharmaceutical company.
      You are chatting with a lead on WhatsApp.
      
      Available Products: ${productNames}
      Available Range PDFs: ${pdfNames}
      
      Your goal is to assist the lead, answer questions, and provide product information.
      
      You can perform the following actions by returning a JSON object:
      1. Reply with text: { "action": "reply", "text": "your message" }
      2. Send a product with image and details: { "action": "send_product", "text": "optional intro message", "resource_name": "exact product name" }
      3. Send a PDF: { "action": "send_pdf", "text": "optional caption", "resource_name": "exact pdf name" }
      4. Send full catalogue (link + all PDFs): { "action": "send_full_catalogue", "text": "optional message" }
      5. Request human intervention (if you can't help): { "action": "intervention_request", "text": "I will connect you with an agent.", "reason": "reason" }
      6. Request contact (if they want a meeting/call): { "action": "contact_request", "text": "I've noted your request.", "reason": "reason" }
      
      When the user asks for product details, images, or information about a specific product, use "send_product" action.
      When the user asks for "full catalogue", "complete catalogue", "all products", or similar requests, use the "send_full_catalogue" action.
      
      Always return ONLY the JSON object. Do not include other text.
      `;

      const chatContext = JSON.stringify(args.context);
      const userPrompt = `Context: ${chatContext}\n\nUser Message: ${args.prompt}`;

      const { text } = await generateWithGemini(ctx, systemPrompt, userPrompt, { jsonMode: true });
      
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
        await ctx.runAction(internal.whatsapp.internal.sendMessage, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          message: aiAction.text,
          quotedMessageId: args.replyingToMessageId,
          quotedMessageExternalId: args.replyingToExternalId,
        });
      } else if (aiAction.action === "send_product") {
        const product = products.find((p: any) => p.name === aiAction.resource_name);
        if (product) {
          console.log(`Found product: ${product.name}, images:`, product.images);
          
          // Send intro message if provided
          if (aiAction.text) {
            await ctx.runAction(internal.whatsapp.internal.sendMessage, {
              leadId: args.leadId,
              phoneNumber: args.phoneNumber,
              message: aiAction.text,
            });
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          // Send product image if available
          if (product.images && product.images.length > 0) {
            const storageId = product.images[0];
            console.log(`[PRODUCT_SEND] Processing image for ${product.name}. StorageId: ${storageId}`);
            
            try {
              const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId });
              console.log(`[PRODUCT_SEND] Image metadata retrieved:`, metadata);
              
              if (!metadata) {
                 console.error(`[PRODUCT_SEND] Metadata is null for storageId: ${storageId}. Image might be missing.`);
              }

              await ctx.runAction(internal.whatsapp.internal.sendMedia, {
                leadId: args.leadId,
                phoneNumber: args.phoneNumber,
                storageId: storageId,
                fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}.jpg`,
                mimeType: metadata?.contentType || "image/jpeg",
                message: product.name
              });
              
              console.log(`[PRODUCT_SEND] Image sent successfully for ${product.name}`);
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
              console.error(`[PRODUCT_SEND] Failed to send product image for ${product.name}:`, error);
            }
          } else {
             console.log(`[PRODUCT_SEND] No images found for product: ${product.name}`);
          }
          
          // Format and send product details
          let detailsMessage = `📦 *${product.name}*\n\n`;
          if (product.brandName) detailsMessage += `Brand: ${product.brandName}\n`;
          if (product.molecule) detailsMessage += `Molecule: ${product.molecule}\n`;
          if (product.mrp) detailsMessage += `MRP: ₹${product.mrp}\n`;
          if (product.packaging) detailsMessage += `Packaging: ${product.packaging}\n`;
          if (product.description) detailsMessage += `\n${product.description}\n`;
          if (product.pageLink) detailsMessage += `\nMore info: ${product.pageLink}`;
          
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: detailsMessage,
          });
        } else {
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: `I couldn't find the product "${aiAction.resource_name}". Please check the product name and try again.`,
          });
        }
      } else if (aiAction.action === "send_pdf") {
         const pdf = rangePdfs.find((p: any) => p.name === aiAction.resource_name);
         if (pdf) {
           const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: pdf.storageId });
           
           await ctx.runAction(internal.whatsapp.internal.sendMedia, {
             leadId: args.leadId,
             phoneNumber: args.phoneNumber,
             storageId: pdf.storageId,
             fileName: `${pdf.name}.pdf`,
             mimeType: metadata?.contentType || "application/pdf",
             message: aiAction.text
           });
         } else {
            await ctx.runAction(internal.whatsapp.internal.sendMessage, {
             leadId: args.leadId,
             phoneNumber: args.phoneNumber,
             message: `I couldn't find the PDF for ${aiAction.resource_name}. ${aiAction.text}`,
           });
         }
      } else if (aiAction.action === "send_full_catalogue") {
          const catalogueMessage = aiAction.text || "Here is our complete product catalogue:";
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: `${catalogueMessage}\n\nhttps://cafoli.in/allproducts.aspx`,
          });

          for (const pdf of rangePdfs) {
            try {
              const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: pdf.storageId });
              
              await ctx.runAction(internal.whatsapp.internal.sendMedia, {
                leadId: args.leadId,
                phoneNumber: args.phoneNumber,
                storageId: pdf.storageId,
                fileName: `${pdf.name}.pdf`,
                mimeType: metadata?.contentType || "application/pdf",
                message: pdf.name
              });
              
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
              console.error(`Failed to send PDF ${pdf.name}:`, error);
            }
          }
      } else if (aiAction.action === "intervention_request") {
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: aiAction.text,
          });
          try {
            // @ts-ignore
            if (internal.interventionRequests && internal.interventionRequests.create) {
                // @ts-ignore
                await ctx.runMutation(internal.interventionRequests.create, { 
                    leadId: args.leadId, 
                    reason: aiAction.reason || "AI Request",
                    status: "pending"
                });
            }
          } catch (e) {
              console.error("Failed to create intervention request", e);
          }
      } else if (aiAction.action === "contact_request") {
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: aiAction.text,
          });
          try {
            // @ts-ignore
            if (internal.contactRequests && internal.contactRequests.create) {
                // @ts-ignore
                await ctx.runMutation(internal.contactRequests.create, { 
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
      await ctx.runAction(internal.whatsapp.internal.sendMessage, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          message: "I'm having trouble processing your request right now. Please try again later.",
      });
    }
  }
});