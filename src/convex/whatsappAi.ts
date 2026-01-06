"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateWithGemini, extractJsonFromMarkdown } from "./lib/gemini";

// Public wrapper for frontend to call
export const generateAndSendAiReply = action({
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
          console.log(`Found product: ${product.name}`);
          
          // Send intro message if provided
          if (aiAction.text) {
            await ctx.runAction(internal.whatsapp.internal.sendMessage, {
              leadId: args.leadId,
              phoneNumber: args.phoneNumber,
              message: aiAction.text,
            });
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          // Send all product images and files
          console.log(`[PRODUCT_SEND] Starting to send files for product: ${product.name}`);
          console.log(`[PRODUCT_SEND] Product has - mainImage: ${!!product.mainImage}, flyer: ${!!product.flyer}, bridgeCard: ${!!product.bridgeCard}, visualaid: ${!!product.visualaid}`);
          
          const filesToSend = [];
          
          // Main Image
          if (product.mainImage) {
            console.log(`[PRODUCT_SEND] Adding mainImage to queue: ${product.mainImage}`);
            filesToSend.push({
              storageId: product.mainImage,
              fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_main.jpg`,
              type: "image",
              label: "Main Image"
            });
          }
          
          // Flyer
          if (product.flyer) {
            console.log(`[PRODUCT_SEND] Adding flyer to queue: ${product.flyer}`);
            filesToSend.push({
              storageId: product.flyer,
              fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_flyer.jpg`,
              type: "image",
              label: "Flyer"
            });
          }
          
          // Bridge Card
          if (product.bridgeCard) {
            console.log(`[PRODUCT_SEND] Adding bridgeCard to queue: ${product.bridgeCard}`);
            filesToSend.push({
              storageId: product.bridgeCard,
              fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_bridge_card.jpg`,
              type: "image",
              label: "Bridge Card"
            });
          }
          
          // Visual Aid (PDF)
          if (product.visualaid) {
            console.log(`[PRODUCT_SEND] Adding visualaid to queue: ${product.visualaid}`);
            filesToSend.push({
              storageId: product.visualaid,
              fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_visualaid.pdf`,
              type: "pdf",
              label: "Visual Aid"
            });
          }
          
          console.log(`[PRODUCT_SEND] Total files to send: ${filesToSend.length}`);
          
          // Send all files
          for (let i = 0; i < filesToSend.length; i++) {
            const file = filesToSend[i];
            try {
              console.log(`[PRODUCT_SEND] [${i + 1}/${filesToSend.length}] Sending ${file.label} for ${product.name}. StorageId: ${file.storageId}`);
              
              const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: file.storageId });
              console.log(`[PRODUCT_SEND] [${i + 1}/${filesToSend.length}] ${file.label} metadata retrieved:`, metadata);
              
              if (!metadata) {
                console.error(`[PRODUCT_SEND] [${i + 1}/${filesToSend.length}] Metadata is null for storageId: ${file.storageId}. File might be missing or corrupted.`);
                continue;
              }

              // Determine correct mime type - fix for old uploads with wrong content type
              let correctMimeType = metadata?.contentType;
              if (!correctMimeType || correctMimeType === "application/octet-stream" || correctMimeType === "text/html") {
                // Fallback based on file type
                correctMimeType = file.type === "pdf" ? "application/pdf" : "image/jpeg";
                console.log(`[PRODUCT_SEND] [${i + 1}/${filesToSend.length}] Correcting mime type from ${metadata?.contentType} to ${correctMimeType}`);
              }

              await ctx.runAction(internal.whatsapp.messages.sendMedia, {
                leadId: args.leadId,
                phoneNumber: args.phoneNumber,
                storageId: file.storageId,
                fileName: file.fileName,
                mimeType: correctMimeType,
                message: undefined
              });
              
              console.log(`[PRODUCT_SEND] [${i + 1}/${filesToSend.length}] ${file.label} sent successfully for ${product.name}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
              console.error(`[PRODUCT_SEND] [${i + 1}/${filesToSend.length}] Failed to send ${file.label} for ${product.name}:`, error);
            }
          }
          
          console.log(`[PRODUCT_SEND] Finished sending all files for ${product.name}`);
          
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
           
           await ctx.runAction(internal.whatsapp.messages.sendMedia, {
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
              
              await ctx.runAction(internal.whatsapp.messages.sendMedia, {
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
          // Send the AI's message to the customer
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: aiAction.text,
          });
          
          // Get lead details to determine assignment
          const lead = await ctx.runQuery(internal.leads.queries.basic.getLeadByIdInternal, { leadId: args.leadId });
          
          // Create intervention request
          await ctx.runMutation(internal.interventionRequests.createInterventionRequestInternal, { 
            leadId: args.leadId,
            assignedTo: (lead && lead.assignedTo && !lead.isColdCallerLead) ? lead.assignedTo : undefined,
            requestedProduct: aiAction.resource_name,
            customerMessage: args.prompt,
            aiDraftedMessage: aiAction.reason || "Customer needs human assistance with their inquiry.",
          });
      } else if (aiAction.action === "contact_request") {
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: aiAction.text,
          });
          
          // Get lead details to determine who to assign the contact request to
          const lead = await ctx.runQuery(internal.leads.queries.basic.getLeadByIdInternal, { leadId: args.leadId });
          
          if (lead && lead.assignedTo) {
            // Create contact request for the assigned user
            await ctx.runMutation(internal.contactRequests.createContactRequestInternal, { 
              leadId: args.leadId,
              assignedTo: lead.assignedTo,
              customerMessage: args.prompt,
            });
          } else {
            console.warn("Cannot create contact request: lead has no assigned user", args.leadId);
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