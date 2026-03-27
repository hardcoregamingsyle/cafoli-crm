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

// Fetch cafoli.in sitemap and return all product URLs
async function fetchCafoliSitemap(): Promise<string[]> {
  try {
    const res = await fetch("https://cafoli.in/sitemap.xml", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const urls: string[] = [];
    const regex = /<loc>(https?:\/\/cafoli\.in\/[^<]+)<\/loc>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  } catch {
    return [];
  }
}

// Extract product details directly from HTML using regex patterns specific to cafoli.in
function extractProductDetailsFromHtml(html: string, pageUrl: string): {
  name: string | null;
  molecule: string | null;
  mrp: string | null;
  packaging: string | null;
  description: string | null;
  imageUrl: string | null;
  pdfUrl: string | null;
  pageLink: string;
} {
  // Extract product name - look for h2 with product name pattern
  let name: string | null = null;
  const nameMatch = html.match(/<h2[^>]*>\s*([^<]{5,80})\s*<\/h2>/i);
  if (nameMatch) name = nameMatch[1].trim();
  // Also try strong tags near "Composition"
  if (!name) {
    const h1Match = html.match(/<h1[^>]*>\s*([^<]{5,100})\s*<\/h1>/i);
    if (h1Match) name = h1Match[1].trim();
  }

  // Extract composition/molecule - look for "Composition :" pattern
  let molecule: string | null = null;
  const compMatch = html.match(/Composition\s*:?\s*<\/strong>\s*([^<]{5,200})/i) ||
    html.match(/Composition\s*:\s*([^\n<]{5,200})/i);
  if (compMatch) molecule = compMatch[1].trim().replace(/&amp;/g, "&").replace(/\s+/g, " ");

  // Extract MRP/Price - look for "Price :" or "₹" pattern
  let mrp: string | null = null;
  const priceMatch = html.match(/Price\s*:?\s*<\/strong>\s*₹?\s*(\d+(?:\.\d+)?)/i) ||
    html.match(/₹\s*(\d+(?:\.\d+)?)\s*\/-/i) ||
    html.match(/Price\s*:\s*₹?\s*(\d+(?:\.\d+)?)/i);
  if (priceMatch) mrp = priceMatch[1];

  // Extract packaging - look for "Packaging :" pattern
  let packaging: string | null = null;
  const packMatch = html.match(/Packaging\s*:?\s*<\/strong>\s*([^<]{2,50})/i) ||
    html.match(/Packaging\s*:\s*([^\n<]{2,50})/i);
  if (packMatch) packaging = packMatch[1].trim();

  // Extract description - look for the main product description paragraph
  let description: string | null = null;
  const descMatch = html.match(/<p[^>]*>\s*(Lubicom|[A-Z][^<]{50,500}Eye Drop[^<]{0,200})\s*<\/p>/i);
  if (descMatch) description = descMatch[1].replace(/<[^>]+>/g, "").trim().substring(0, 300);

  // Extract image URL - look for OtherPageImages pattern (cafoli.in specific)
  let imageUrl: string | null = null;
  const imgMatches = html.match(/https:\/\/cafoli\.in\/Static\/V1\/OtherPageImages\/[^"'\s>]+\.(?:webp|jpg|jpeg|png)/gi);
  if (imgMatches && imgMatches.length > 0) {
    // Pick the first non-empty image URL
    imageUrl = imgMatches.find(u => !u.endsWith("/")) || imgMatches[0];
  }

  // Extract PDF URL - look for OtherPagepdf pattern (cafoli.in specific)
  let pdfUrl: string | null = null;
  const pdfMatches = html.match(/https:\/\/cafoli\.in\/Static\/V1\/OtherPagepdf\/[^"'\s>]+\.pdf/gi);
  if (pdfMatches && pdfMatches.length > 0) {
    pdfUrl = pdfMatches[0];
  }

  return { name, molecule, mrp, packaging, description, imageUrl, pdfUrl, pageLink: pageUrl };
}

// Use Gemini to find the best matching product URL from the sitemap
async function findBestProductUrl(ctx: any, userMessage: string, sitemapUrls: string[]): Promise<string | null> {
  try {
    // Filter to likely product URLs only (exclude category pages, home, etc.)
    const productUrls = sitemapUrls.filter(u =>
      !u.includes("sitemap") && !u.includes(".xml") &&
      u !== "https://cafoli.in/" &&
      !u.endsWith("/allproducts.aspx") &&
      !u.endsWith("/allproduct.aspx") &&
      !u.endsWith("/alldivisions.aspx") &&
      !u.endsWith("/alltherapeutics.aspx") &&
      !u.endsWith("/AllNotification.aspx") &&
      !u.includes("/index") &&
      // Product URLs typically have hyphens and molecule names
      u.split("/").pop()!.includes("-")
    ).slice(0, 300);

    if (productUrls.length === 0) return null;

    const urlList = productUrls.join("\n");
    const systemPrompt = `You are a pharmaceutical expert. Given a user's product query and a list of product page URLs from cafoli.in, find the single best matching URL.
The URL slugs contain the molecule/product name in hyphenated form.
Return ONLY a JSON object: { "url": "https://cafoli.in/..." } or { "url": null } if no match found.

Matching rules:
- Match by molecule name in the URL slug (e.g., "carboxymethylcellulose" for Lubricel/Lubicom)
- Match by product name keywords
- For competitor brands, identify the molecule first, then match that molecule in the URL
- Return null ONLY if truly no match exists

Return ONLY the JSON object.`;

    const { text } = await generateWithGemini(ctx, systemPrompt,
      `User query: "${userMessage}"\n\nAvailable URLs:\n${urlList}`,
      { jsonMode: true }
    );
    const jsonStr = extractJsonFromMarkdown(text);
    const parsed = JSON.parse(jsonStr);
    return parsed.url || null;
  } catch (e) {
    logAiError("FIND_PRODUCT_URL", e);
    return null;
  }
}

// Send a website-sourced product to the lead
async function sendWebsiteProductToLead(ctx: any, productDetails: {
  name: string | null;
  molecule: string | null;
  mrp: string | null;
  packaging: string | null;
  description: string | null;
  imageUrl: string | null;
  pdfUrl: string | null;
  pageLink: string;
}, args: { leadId: any; phoneNumber: string }, introText?: string) {
  if (introText) {
    await ctx.runAction(internal.whatsapp.internal.sendMessage, {
      leadId: args.leadId,
      phoneNumber: args.phoneNumber,
      message: introText,
    });
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // Send image if available
  if (productDetails.imageUrl) {
    try {
      const imgUrl = productDetails.imageUrl;
      const imgLower = imgUrl.toLowerCase();
      const mimeType = imgLower.endsWith(".webp") ? "image/webp" : imgLower.endsWith(".png") ? "image/png" : "image/jpeg";
      const safeName = (productDetails.name || "product").replace(/[^a-zA-Z0-9]/g, "_");
      const ext = imgLower.split(".").pop()?.split("?")[0] || "jpg";
      await ctx.runAction(internal.whatsapp.messages.sendMediaFromUrl, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        url: imgUrl,
        fileName: `${safeName}.${ext}`,
        mimeType,
      });
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (imgErr) {
      logAiError("SEND_WEBSITE_PRODUCT_IMG", imgErr, { url: productDetails.imageUrl });
    }
  }

  // Send PDF if available
  if (productDetails.pdfUrl) {
    try {
      const safeName = (productDetails.name || "product").replace(/[^a-zA-Z0-9]/g, "_");
      await ctx.runAction(internal.whatsapp.messages.sendMediaFromUrl, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        url: productDetails.pdfUrl,
        fileName: `${safeName}.pdf`,
        mimeType: "application/pdf",
      });
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (pdfErr) {
      logAiError("SEND_WEBSITE_PRODUCT_PDF", pdfErr, { url: productDetails.pdfUrl });
    }
  }

  // Send product details text
  const displayName = productDetails.name || "Product";
  const detailsMessage = [
    `*${displayName}*`,
    productDetails.molecule ? `Composition: ${productDetails.molecule}` : null,
    productDetails.mrp ? `MRP: ₹${productDetails.mrp}` : null,
    productDetails.packaging ? `Packaging: ${productDetails.packaging}` : null,
    productDetails.description ? `\n${productDetails.description}` : null,
    `\nMore info: ${productDetails.pageLink}`,
  ].filter(Boolean).join("\n");

  await ctx.runAction(internal.whatsapp.internal.sendMessage, {
    leadId: args.leadId,
    phoneNumber: args.phoneNumber,
    message: detailsMessage,
  });
}

// Fallback: send product from internal catalog
async function sendCatalogProductToLead(ctx: any, product: any, args: { leadId: any; phoneNumber: string }, introText?: string) {
  if (introText) {
    await ctx.runAction(internal.whatsapp.internal.sendMessage, {
      leadId: args.leadId,
      phoneNumber: args.phoneNumber,
      message: introText,
    });
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  if (product.externalImageUrl) {
    try {
      const extUrl = product.externalImageUrl.toLowerCase();
      const mimeType = extUrl.endsWith(".webp") ? "image/webp" : extUrl.endsWith(".png") ? "image/png" : "image/jpeg";
      await ctx.runAction(internal.whatsapp.messages.sendMediaFromUrl, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        url: product.externalImageUrl,
        fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}.${extUrl.split(".").pop() || "jpg"}`,
        mimeType,
      });
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (imgErr) {
      logAiError("SEND_CATALOG_EXT_IMG", imgErr);
    }
  } else if (product.mainImage) {
    try {
      const meta = await ctx.runQuery(internal.products.getStorageMetadata, { storageId: product.mainImage as any });
      if (meta) {
        let mimeType = meta.contentType || "image/jpeg";
        if (!mimeType || mimeType === "application/octet-stream") mimeType = "image/jpeg";
        await ctx.runAction("whatsapp/messages:sendMedia" as any, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          storageId: product.mainImage,
          fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}_main.jpg`,
          mimeType,
          message: undefined,
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (e) {
      logAiError("SEND_CATALOG_IMG", e);
    }
  }

  if (product.externalPdfUrl) {
    try {
      await ctx.runAction(internal.whatsapp.messages.sendMediaFromUrl, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        url: product.externalPdfUrl,
        fileName: `${product.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
        mimeType: "application/pdf",
      });
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (pdfErr) {
      logAiError("SEND_CATALOG_EXT_PDF", pdfErr);
    }
  }

  const detailsMessage = [
    `*${product.name}*`,
    product.molecule ? `Molecule: ${product.molecule}` : null,
    product.mrp ? `MRP: ₹${product.mrp}` : null,
    product.packaging ? `Packaging: ${product.packaging}` : null,
    product.description ? `\n${product.description}` : null,
    product.pageLink ? `\nMore info: ${product.pageLink}` : null,
  ].filter(Boolean).join("\n");

  await ctx.runAction(internal.whatsapp.internal.sendMessage, {
    leadId: args.leadId,
    phoneNumber: args.phoneNumber,
    message: detailsMessage,
  });
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

      const rangePdfs = await ctx.runQuery(internal.rangePdfs.listRangePdfsInternal);
      const pdfNames = rangePdfs.map((p: any) => p.name).join(", ");

      const systemPrompt = `You are a helpful CRM assistant for Cafoli Lifecare, a pharmaceutical company (website: https://cafoli.in).
You are chatting with a lead on WhatsApp.

Available Range PDFs: ${pdfNames}

Your goal is to assist the lead, answer questions, and provide product information.

PRODUCT QUERIES: When the user asks about any product (Cafoli brand, competitor brand, or molecule), use the "send_product" action. The system will automatically look up the product on cafoli.in website.

You can perform the following actions by returning a JSON object:
1. Reply with text: { "action": "reply", "text": "your message" }
2. Send a product (any product query): { "action": "send_product", "text": "optional intro message", "resource_name": "the product name or molecule the user asked about" }
3. Send a PDF: { "action": "send_pdf", "text": "optional caption", "resource_name": "exact pdf name from list above" }
4. Send full catalogue (link + all PDFs): { "action": "send_full_catalogue", "text": "optional message" }
5. Request human intervention (if you can't help): { "action": "intervention_request", "text": "I will connect you with an agent.", "reason": "reason" }
6. Request contact (if they want a meeting/call): { "action": "contact_request", "text": "I've noted your request.", "reason": "reason" }

RULES:
- For send_product, resource_name should be the product name or molecule the user mentioned (can be competitor brand name, molecule name, or Cafoli product name).
- When the user asks for "full catalogue", "complete catalogue", "all products", use send_full_catalogue.
- For general questions not about products, use reply.
- Do NOT say you cannot find a product — use send_product and the system will handle the lookup.

Always return ONLY the JSON object. Do not include other text.`;

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
        logAiInfo("SEND_PRODUCT", `Looking up product on cafoli.in: "${aiAction.resource_name}"`, { leadId: args.leadId });

        let productSent = false;

        // Step 1: Fetch cafoli.in sitemap
        const sitemapUrls = await fetchCafoliSitemap();
        logAiInfo("SEND_PRODUCT", `Fetched ${sitemapUrls.length} URLs from sitemap`, { leadId: args.leadId });

        if (sitemapUrls.length > 0) {
          // Step 2: Find best matching product URL using Gemini
          const productUrl = await findBestProductUrl(ctx, `${aiAction.resource_name} ${args.prompt}`, sitemapUrls);
          logAiInfo("SEND_PRODUCT", `Best matching URL: ${productUrl}`, { leadId: args.leadId });

          if (productUrl) {
            // Step 3: Fetch the product page HTML
            try {
              const res = await fetch(productUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
                signal: AbortSignal.timeout(12000),
              });
              if (res.ok) {
                const html = await res.text();
                // Step 4: Extract product details directly from HTML using regex (no Gemini needed)
                const productDetails = extractProductDetailsFromHtml(html, productUrl);
                logAiInfo("SEND_PRODUCT", `Extracted: name=${productDetails.name}, img=${productDetails.imageUrl ? "yes" : "no"}, pdf=${productDetails.pdfUrl ? "yes" : "no"}`, { leadId: args.leadId });

                if (productDetails.name || productDetails.imageUrl || productDetails.pdfUrl) {
                  await sendWebsiteProductToLead(ctx, productDetails, { leadId: args.leadId, phoneNumber: args.phoneNumber }, aiAction.text);
                  productSent = true;
                }
              }
            } catch (fetchErr) {
              logAiError("FETCH_PRODUCT_PAGE", fetchErr, { url: productUrl });
            }
          }
        }

        // Fallback: try internal catalog if website lookup failed
        if (!productSent) {
          logAiInfo("SEND_PRODUCT", `Website lookup failed, trying internal catalog`, { leadId: args.leadId });
          const products = await ctx.runQuery(internal.products.listProductsInternal);
          const resourceLower = (aiAction.resource_name || "").toLowerCase();
          const promptLower = args.prompt.toLowerCase();

          let product = products.find((p: any) => p.name?.toLowerCase() === resourceLower);
          if (!product) product = products.find((p: any) => p.name?.toLowerCase().includes(resourceLower) || resourceLower.includes(p.name?.toLowerCase() || ""));
          if (!product) product = products.find((p: any) => p.molecule && (p.molecule.toLowerCase().includes(resourceLower) || resourceLower.includes(p.molecule.toLowerCase())));
          if (!product) product = products.find((p: any) => p.molecule && (p.molecule.toLowerCase().includes(promptLower) || promptLower.includes(p.molecule.toLowerCase())));

          if (product) {
            logAiInfo("SEND_PRODUCT", `Found in catalog: ${product.name}`, { leadId: args.leadId });
            await sendCatalogProductToLead(ctx, product, { leadId: args.leadId, phoneNumber: args.phoneNumber }, aiAction.text);
            productSent = true;
          }
        }

        // Final fallback: escalate to intervention
        if (!productSent) {
          logAiInfo("SEND_PRODUCT", `No product found anywhere, escalating`, { leadId: args.leadId });
          await ctx.runAction(internal.whatsapp.internal.sendMessage, {
            leadId: args.leadId,
            phoneNumber: args.phoneNumber,
            message: `I wasn't able to find "${aiAction.resource_name}" in our catalog right now. Let me connect you with our team who can help you better.`,
          });
          const lead = await ctx.runQuery(internal.leads.queries.basic.getLeadByIdInternal, { leadId: args.leadId });
          await ctx.runMutation(internal.interventionRequests.createInterventionRequestInternal, {
            leadId: args.leadId,
            assignedTo: (lead && lead.assignedTo && !lead.isColdCallerLead) ? lead.assignedTo : undefined,
            requestedProduct: aiAction.resource_name,
            customerMessage: args.prompt,
            aiDraftedMessage: `Customer asked for "${aiAction.resource_name}" but no matching product was found on cafoli.in or in the catalog. Please assist.`,
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