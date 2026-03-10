"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { generateWithGemini, extractJsonFromMarkdown } from "./lib/gemini";

// Structured error logger for whatsappAi
function logAiError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(
    `[WHATSAPP_AI][${context}] ERROR: ${message}`,
    JSON.stringify({ ...extra, stack: stack?.split("\n").slice(0, 5) })
  );
}

function logAiInfo(context: string, message: string, extra?: Record<string, unknown>) {
  console.log(`[WHATSAPP_AI][${context}] ${message}`, extra ? JSON.stringify(extra) : "");
}

export const generateChatSummary = action({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    const chats = await ctx.runQuery(internal.whatsappQueries.getChatsByLeadId, { leadId: args.leadId });
    if (!chats || chats.length === 0) return "No chat history found.";
    
    const messages = chats[0].messages || [];
    if (messages.length === 0) return "No messages to summarize.";

    // Take last 100 messages to avoid token limits
    const recentMessages = messages.slice(-100);
    const formattedMessages = recentMessages.map((m: any) => `${m.direction === 'inbound' ? 'Lead' : 'Agent'}: ${m.content || 'Media/File'}`).join('\n');

    const systemPrompt = `You are a helpful CRM assistant. Summarize the following WhatsApp conversation between an agent and a lead. Keep it concise and highlight key points, requested products, and any pending actions.`;
    const userPrompt = `Conversation:\n${formattedMessages}`;

    const { text } = await generateWithGemini(ctx, systemPrompt, userPrompt);
    return text;
  }
});

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
    const logCtx = `lead=${args.leadId} phone=${args.phoneNumber} auto=${args.isAutoReply ?? false}`;

    try {
      logAiInfo("REPLY", "Starting AI reply generation", { leadId: args.leadId, prompt: args.prompt.substring(0, 80) });

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
        logAiError("PARSE_JSON", e, { rawText: text.substring(0, 200) });
        // Fallback to text reply
        aiAction = { action: "reply", text: text };
      }

      logAiInfo("ACTION", `Executing AI action: ${aiAction.action}`, { resource: aiAction.resource_name });

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
          logAiInfo("SEND_PRODUCT", `Found product: ${product.name}`, { leadId: args.leadId });
          
          // Send intro message if provided
          if (aiAction.text) {
            await ctx.runAction(internal.whatsapp.internal.sendMessage, {
              leadId: args.leadId,
              phoneNumber: args.phoneNumber,
              message: aiAction.text,
            });
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          // Collect all files to send
          const filesToSend = [];
          
          // Helper to get extension from metadata
          const getExtension = async (storageId: string) => {
             const meta = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: storageId as any });
             if (meta?.contentType === "image/png") return "png";
             if (meta?.contentType === "image/jpeg" || meta?.contentType === "image/jpg") return "jpg";
             if (meta?.contentType === "application/pdf") return "pdf";
             return "jpg"; // Default for images
          };

          // Main Image
          if (product.mainImage) {
            const ext = await getExtension(product.mainImage);
            filesToSend.push({
              storageId: product.mainImage,
              fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_main.${ext}`,
              type: "image",
              label: "Main Image"
            });
          }
          
          // Flyer
          if (product.flyer) {
            const ext = await getExtension(product.flyer);
            filesToSend.push({
              storageId: product.flyer,
              fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_flyer.${ext}`,
              type: "image",
              label: "Flyer"
            });
          }
          
          // Bridge Card
          if (product.bridgeCard) {
            const ext = await getExtension(product.bridgeCard);
            filesToSend.push({
              storageId: product.bridgeCard,
              fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_bridge_card.${ext}`,
              type: "image",
              label: "Bridge Card"
            });
          }
          
          // Visual Aid (PDF)
          if (product.visualaid) {
            filesToSend.push({
              storageId: product.visualaid,
              fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_visualaid.pdf`,
              type: "pdf",
              label: "Visual Aid"
            });
          }

          // CHECK FOR CLOUDFLARE WORKER CONFIGURATION
          const useCloudflare = !!process.env.CLOUDFLARE_WORKER_URL;
          let sentViaCloudflare = false;

          if (useCloudflare && filesToSend.length > 0) {
             logAiInfo("SEND_PRODUCT", `Using Cloudflare Worker Relay for ${filesToSend.length} files`);
             
             // Prepare files with signed URLs
             const filesWithUrls = [];
             for (const file of filesToSend) {
                const url = await ctx.storage.getUrl(file.storageId);
                const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: file.storageId });
                
                // Determine correct mime type
                let correctMimeType = metadata?.contentType;
                if (!correctMimeType || correctMimeType === "application/octet-stream" || correctMimeType === "text/html") {
                  correctMimeType = file.type === "pdf" ? "application/pdf" : "image/jpeg";
                }

                if (url) {
                  filesWithUrls.push({
                    url,
                    fileName: file.fileName,
                    mimeType: correctMimeType || "application/octet-stream"
                  });
                } else {
                  logAiError("SEND_PRODUCT", new Error(`Failed to generate URL for ${file.fileName}`), { storageId: file.storageId });
                }
             }

             // Call the worker action
             try {
               await ctx.runAction(internal.whatsapp.cloudflare.sendFilesViaWorker, {
                 phoneNumber: args.phoneNumber,
                 files: filesWithUrls
               });
               logAiInfo("SEND_PRODUCT", "Cloudflare Worker successfully triggered");
               sentViaCloudflare = true;
             } catch (err) {
               logAiError("SEND_PRODUCT_CLOUDFLARE", err, { fallback: true });
               // Fallback logic will execute below because sentViaCloudflare is false
             }
          } 
          
          if (!sentViaCloudflare) {
            logAiInfo("SEND_PRODUCT", `Using Direct Convex Send (${filesToSend.length} files)`);
            
            for (let i = 0; i < filesToSend.length; i++) {
              const file = filesToSend[i];
              try {
                const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: file.storageId });
                
                if (!metadata) {
                  logAiError("SEND_PRODUCT_FILE", new Error(`No metadata for ${file.label}`), { storageId: file.storageId });
                  continue;
                }

                let correctMimeType = metadata?.contentType;
                if (!correctMimeType || correctMimeType === "application/octet-stream" || correctMimeType === "text/html") {
                  correctMimeType = file.type === "pdf" ? "application/pdf" : "image/jpeg";
                }

                await ctx.runAction("whatsapp/messages:sendMedia" as any, {
                  leadId: args.leadId,
                  phoneNumber: args.phoneNumber,
                  storageId: file.storageId,
                  fileName: file.fileName,
                  mimeType: correctMimeType,
                  message: undefined
                });
                
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (error) {
                logAiError("SEND_PRODUCT_FILE", error, { label: file.label, fileName: file.fileName });
              }
            }
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
          logAiError("SEND_PRODUCT", new Error(`Product not found: ${aiAction.resource_name}`), { availableCount: products.length });
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: `I couldn't find the product "${aiAction.resource_name}". Please check the product name and try again.`,
          });
        }
      } else if (aiAction.action === "send_pdf") {
         const pdf = rangePdfs.find((p: any) => p.name === aiAction.resource_name);
         if (pdf) {
           logAiInfo("SEND_PDF", `Sending PDF: ${pdf.name}`, { leadId: args.leadId });
           const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: pdf.storageId });
           
           await ctx.runAction("whatsapp/messages:sendMedia" as any, {
             leadId: args.leadId,
             phoneNumber: args.phoneNumber,
             storageId: pdf.storageId,
             fileName: `${pdf.name}.pdf`,
             mimeType: metadata?.contentType || "application/pdf",
             message: aiAction.text
           });
         } else {
           logAiError("SEND_PDF", new Error(`PDF not found: ${aiAction.resource_name}`), { availableCount: rangePdfs.length });
           await ctx.runAction(internal.whatsapp.internal.sendMessage, {
             leadId: args.leadId,
             phoneNumber: args.phoneNumber,
             message: `I couldn't find the PDF for ${aiAction.resource_name}. ${aiAction.text}`,
           });
         }
      } else if (aiAction.action === "send_full_catalogue") {
          logAiInfo("SEND_CATALOGUE", `Sending full catalogue with ${rangePdfs.length} PDFs`, { leadId: args.leadId });
          const catalogueMessage = aiAction.text || "Here is our complete product catalogue:";
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: `${catalogueMessage}\n\nhttps://cafoli.in/allproducts.aspx`,
          });

          for (const pdf of rangePdfs) {
            try {
              const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: pdf.storageId });
              
              await ctx.runAction("whatsapp/messages:sendMedia" as any, {
                leadId: args.leadId,
                phoneNumber: args.phoneNumber,
                storageId: pdf.storageId,
                fileName: `${pdf.name}.pdf`,
                mimeType: metadata?.contentType || "application/pdf",
                message: pdf.name
              });
              
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
              logAiError("SEND_CATALOGUE_PDF", error, { pdfName: pdf.name });
            }
          }
      } else if (aiAction.action === "intervention_request") {
          logAiInfo("INTERVENTION", `Creating intervention request`, { leadId: args.leadId, reason: aiAction.reason });
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: aiAction.text,
          });
          
          const lead = await ctx.runQuery(internal.leads.queries.basic.getLeadByIdInternal, { leadId: args.leadId });
          
          await ctx.runMutation(internal.interventionRequests.createInterventionRequestInternal, { 
            leadId: args.leadId,
            assignedTo: (lead && lead.assignedTo && !lead.isColdCallerLead) ? lead.assignedTo : undefined,
            requestedProduct: aiAction.resource_name,
            customerMessage: args.prompt,
            aiDraftedMessage: aiAction.reason || "Customer needs human assistance with their inquiry.",
          });
      } else if (aiAction.action === "contact_request") {
          logAiInfo("CONTACT_REQUEST", `Creating contact request`, { leadId: args.leadId });
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: aiAction.text,
          });
          
          const lead = await ctx.runQuery(internal.leads.queries.basic.getLeadByIdInternal, { leadId: args.leadId });
          
          if (lead && lead.assignedTo) {
            await ctx.runMutation(internal.contactRequests.createContactRequestInternal, { 
              leadId: args.leadId,
              assignedTo: lead.assignedTo,
              customerMessage: args.prompt,
            });
          } else {
            // No assigned user - create an intervention request instead so it doesn't go unnoticed
            logAiInfo("CONTACT_REQUEST", "Lead has no assigned user, creating intervention request instead", { leadId: args.leadId });
            await ctx.runMutation(internal.interventionRequests.createInterventionRequestInternal, { 
              leadId: args.leadId,
              assignedTo: undefined,
              requestedProduct: undefined,
              customerMessage: args.prompt,
              aiDraftedMessage: `Contact request from unassigned lead: ${aiAction.reason || "Customer wants to be contacted."}`,
            });
          }
      } else {
        logAiError("UNKNOWN_ACTION", new Error(`Unknown AI action: ${aiAction.action}`), { aiAction });
      }

      logAiInfo("REPLY", "AI reply generation complete", { action: aiAction.action, leadId: args.leadId });

    } catch (error) {
      logAiError("GENERATE_REPLY", error, { leadId: args.leadId, phoneNumber: args.phoneNumber, prompt: args.prompt.substring(0, 100) });
      try {
        await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: "I'm having trouble processing your request right now. Please try again later.",
        });
      } catch (sendErr) {
        logAiError("FALLBACK_SEND", sendErr, { leadId: args.leadId });
      }
    }
  }
});