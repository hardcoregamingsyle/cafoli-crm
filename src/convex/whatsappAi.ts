"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateWithGemini, extractJsonFromMarkdown } from "./lib/gemini";

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

// Fetch and parse the cafoli.in sitemap to get all product URLs
async function fetchSitemapUrls(): Promise<string[]> {
  try {
    const response = await fetch("https://cafoli.in/sitemap.xml", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const matches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
    return matches.map(m => m.replace(/<\/?loc>/g, "").trim());
  } catch (e) {
    console.warn("[SITEMAP] Failed to fetch sitemap:", e);
    return [];
  }
}

// Fetch a product page and extract its plain text content
async function fetchPageText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return "";
    const html = await response.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 3000);
    return text;
  } catch (e) {
    console.warn(`[PAGE_FETCH] Failed to fetch ${url}:`, e);
    return "";
  }
}

// Use AI to find the best matching product URL from sitemap and extract enriched details
async function fetchProductDetailsFromSite(
  ctx: any,
  productName: string,
  productDbInfo: any
): Promise<{ pageText: string; pageUrl: string } | null> {
  try {
    const urls = await fetchSitemapUrls();
    if (urls.length === 0) {
      logAiInfo("SITEMAP", "No URLs found in sitemap, skipping web enrichment");
      return null;
    }

    // Filter to product-like URLs
    const productUrls = urls.filter(url =>
      url.includes("cafoli.in") &&
      !url.endsWith("cafoli.in/") &&
      !url.includes("contact") &&
      !url.includes("about") &&
      !url.includes("sitemap") &&
      !url.includes("allproducts")
    );

    logAiInfo("SITEMAP", `Found ${productUrls.length} product URLs in sitemap`);
    if (productUrls.length === 0) return null;

    // Use AI to pick the best matching URL for this product
    const urlList = productUrls.slice(0, 150).join("\n");
    const matchPrompt = `Given the pharmaceutical product name "${productName}" (molecule/composition: ${productDbInfo.molecule || "unknown"}, brand: ${productDbInfo.brandName || productName}), which of these URLs is most likely the product page for it? Return ONLY the exact URL, nothing else. If none match, return "none".\n\nURLs:\n${urlList}`;

    const { text: matchedUrl } = await generateWithGemini(
      ctx,
      "You are a URL matcher for a pharmaceutical website. Return only the single best matching URL or 'none'.",
      matchPrompt
    );
    const cleanUrl = matchedUrl.trim().replace(/['"<>\s]/g, "");

    if (!cleanUrl || cleanUrl === "none" || !cleanUrl.startsWith("http")) {
      logAiInfo("SITEMAP", `No matching URL found for product: ${productName}`);
      return null;
    }

    logAiInfo("SITEMAP", `Matched URL for ${productName}: ${cleanUrl}`);

    const pageText = await fetchPageText(cleanUrl);
    if (!pageText) return null;

    return { pageText, pageUrl: cleanUrl };
  } catch (e) {
    logAiError("SITEMAP_MATCH", e, { productName });
    return null;
  }
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
    const recentMessages = messages.slice(-100);
    const formattedMessages = recentMessages.map((m: any) => `${m.direction === 'inbound' ? 'Lead' : 'Agent'}: ${m.content || 'Media/File'}`).join('\n');
    const systemPrompt = `You are a helpful CRM assistant. Summarize the following WhatsApp conversation between an agent and a lead. Keep it concise and highlight key points, requested products, and any pending actions.`;
    const userPrompt = `Conversation:\n${formattedMessages}`;
    const { text } = await generateWithGemini(ctx, systemPrompt, userPrompt);
    return text;
  }
});

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
      logAiInfo("REPLY", "Starting AI reply generation", { leadId: args.leadId, prompt: args.prompt.substring(0, 80) });

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
        aiAction = { action: "reply", text: text };
      }

      logAiInfo("ACTION", `Executing AI action: ${aiAction.action}`, { resource: aiAction.resource_name });

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

          if (aiAction.text) {
            await ctx.runAction(internal.whatsapp.internal.sendMessage, {
              leadId: args.leadId,
              phoneNumber: args.phoneNumber,
              message: aiAction.text,
            });
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          const filesToSend: Array<{ storageId: string; fileName: string; type: string; label: string }> = [];

          const getExtension = async (storageId: string) => {
            const meta = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: storageId as any });
            if (meta?.contentType === "image/png") return "png";
            if (meta?.contentType === "image/jpeg" || meta?.contentType === "image/jpg") return "jpg";
            if (meta?.contentType === "application/pdf") return "pdf";
            return "jpg";
          };

          if (product.mainImage) {
            const ext = await getExtension(product.mainImage);
            filesToSend.push({ storageId: product.mainImage, fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_main.${ext}`, type: "image", label: "Main Image" });
          }
          if (product.flyer) {
            const ext = await getExtension(product.flyer);
            filesToSend.push({ storageId: product.flyer, fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_flyer.${ext}`, type: "image", label: "Flyer" });
          }
          if (product.bridgeCard) {
            const ext = await getExtension(product.bridgeCard);
            filesToSend.push({ storageId: product.bridgeCard, fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_bridge_card.${ext}`, type: "image", label: "Bridge Card" });
          }
          if (product.visualaid) {
            filesToSend.push({ storageId: product.visualaid, fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_visualaid.pdf`, type: "pdf", label: "Visual Aid" });
          }

          // Send all files directly
          logAiInfo("SEND_PRODUCT", `Sending ${filesToSend.length} files directly`);
          for (const file of filesToSend) {
            try {
              const metadata = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: file.storageId as any });
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
            } catch (fileError) {
              logAiError("SEND_PRODUCT_FILE", fileError, { label: file.label, storageId: file.storageId });
            }
          }

          // Try to enrich product details from cafoli.in website via sitemap
          let detailsMessage: string;
          try {
            const siteData = await fetchProductDetailsFromSite(ctx, product.name, product);
            if (siteData) {
              const extractPrompt = `From this pharmaceutical product page content, extract key product information (product name, molecule/composition, indications/uses, dosage, packaging, MRP, key features/benefits). Format it as a clean, concise WhatsApp message using *bold* for headers. Max 200 words.\n\nPage content:\n${siteData.pageText}`;
              const { text: extracted } = await generateWithGemini(
                ctx,
                "You are a pharmaceutical product information extractor. Extract and format product details for WhatsApp.",
                extractPrompt
              );
              detailsMessage = extracted.trim();
              if (product.pageLink) {
                detailsMessage += `\n\nMore info: ${product.pageLink}`;
              }
              logAiInfo("SEND_PRODUCT", `Used web-enriched details for ${product.name}`);
            } else {
              throw new Error("No site data");
            }
          } catch (_webErr) {
            // Fall back to DB details
            detailsMessage = [
              `*${product.name}*`,
              product.molecule ? `Molecule: ${product.molecule}` : null,
              product.mrp ? `MRP: ₹${product.mrp}` : null,
              product.packaging ? `Packaging: ${product.packaging}` : null,
              product.description ? `\n${product.description}` : null,
              product.pageLink ? `\nMore info: ${product.pageLink}` : null,
            ].filter(Boolean).join("\n");
          }

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