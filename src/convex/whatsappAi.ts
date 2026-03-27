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

// Fetch text content from a URL (returns raw HTML)
async function fetchPageHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

// Extract product details directly from cafoli.in product page HTML using regex
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
  // Extract product name from <h2> tag
  const h2Match = html.match(/<h2[^>]*>\s*([^<]{3,100})\s*<\/h2>/i);
  const name = h2Match ? h2Match[1].trim() : null;

  // Extract composition/molecule from "Composition :" pattern
  const compMatch = html.match(/Composition\s*[:\-]\s*<\/strong>\s*([^<\n]+)/i) ||
                    html.match(/Composition\s*[:\-]\s*([^\n<]{5,200})/i);
  const molecule = compMatch ? compMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // Extract MRP: look for ₹ followed by number
  const mrpMatch = html.match(/[₹Rs\.]\s*(\d+(?:\.\d+)?)\s*\/-/i) ||
                   html.match(/Price\s*:\s*[₹Rs\.]*\s*(\d+)/i);
  const mrp = mrpMatch ? mrpMatch[1] : null;

  // Extract packaging
  const packagingMatch = html.match(/Packaging\s*:\s*<\/strong>\s*([^<\n]+)/i) ||
                         html.match(/Packaging\s*:\s*([^\n<]+)/i);
  const packaging = packagingMatch ? packagingMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // Extract best image URL from cafoli.in static images
  const imageMatches = [...html.matchAll(/https:\/\/cafoli\.in\/Static\/V1\/OtherPageImages\/([^"'\s]+\.webp)/gi)];
  // Filter out empty filenames and prefer images with timestamps (longer filenames)
  const validImages = imageMatches
    .map(m => `https://cafoli.in/Static/V1/OtherPageImages/${m[1]}`)
    .filter(url => {
      const filename = url.split("/").pop() || "";
      return filename.length > 10 && !filename.endsWith("/");
    });
  // Pick the second image if available (usually the cleaner product shot), else first
  const imageUrl = validImages[1] || validImages[0] || null;

  // Extract PDF URL
  const pdfMatches = [...html.matchAll(/https:\/\/cafoli\.in\/Static\/V1\/OtherPagepdf\/([^"'\s]+\.pdf)/gi)];
  const pdfUrl = pdfMatches.length > 0 ? `https://cafoli.in/Static/V1/OtherPagepdf/${pdfMatches[0][1]}` : null;

  // Extract description (text after product name)
  const descMatch = html.match(/Lubicom|Eye Drop|Tablet|Capsule|Syrup|Injection|Cream|Gel|Ointment|Drops/i);
  let description: string | null = null;
  if (name) {
    // Find a paragraph with substantial text
    const paraMatches = [...html.matchAll(/<p[^>]*>([^<]{100,600})<\/p>/gi)];
    if (paraMatches.length > 0) {
      description = paraMatches[0][1].replace(/<[^>]+>/g, "").trim().substring(0, 400);
    }
  }

  return { name, molecule, mrp, packaging, description, imageUrl, pdfUrl, pageLink: pageUrl };
}

// Use Gemini to find the best matching product URL from the sitemap
async function findBestProductUrl(ctx: any, userMessage: string, sitemapUrls: string[]): Promise<string | null> {
  try {
    const productUrls = sitemapUrls.filter(u =>
      !u.includes("sitemap") && !u.includes(".xml") &&
      u !== "https://cafoli.in/" &&
      !u.endsWith("/allproducts.aspx") &&
      !u.endsWith("/allproduct.aspx") &&
      !u.includes("alltherapeutic") &&
      !u.includes("alldivision") &&
      !u.includes("SearchProducts") &&
      !u.includes("Static/")
    ).slice(0, 300);

    if (productUrls.length === 0) return null;

    const urlList = productUrls.join("\n");
    const systemPrompt = `You are a pharmaceutical expert. Given a user's product query and a list of product page URLs from cafoli.in, find the single best matching URL.
Return ONLY a JSON object: { "url": "https://cafoli.in/..." } or { "url": null } if no match.
The URL slugs contain the molecule/product name. Match by molecule, brand name, or product name.
Examples:
- "Lubricel Eye Drop" → look for carboxymethylcellulose in URL slugs
- "Lubicom Plus" → look for carboxymethylcellulose in URL slugs
- "sodium-carboxymethylcellulose" → match that molecule
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

// Find best matching product from the cafoliWebProducts DB cache
function findWebProductByQuery(webProducts: any[], query: string): any | null {
  if (!webProducts || webProducts.length === 0) return null;
  const q = query.toLowerCase();
  
  // Exact brand name match
  let match = webProducts.find((p: any) => p.brandName?.toLowerCase() === q);
  if (match) return match;
  
  // Partial brand name match
  match = webProducts.find((p: any) =>
    p.brandName?.toLowerCase().includes(q) || q.includes(p.brandName?.toLowerCase() || "")
  );
  if (match) return match;
  
  // Composition/molecule match
  match = webProducts.find((p: any) =>
    p.composition && (
      p.composition.toLowerCase().includes(q) ||
      q.includes(p.composition.toLowerCase().substring(0, 20))
    )
  );
  if (match) return match;
  
  return null;
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
        url: productDetails.imageUrl,
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
  const detailsMessage = [
    productDetails.name ? `*${productDetails.name}*` : null,
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

      // Load cached web products for fast matching
      const webProducts = await ctx.runQuery("cafoliScraper:listWebProducts" as any);
      const webProductCount = webProducts.length;

      // Build product list for AI context (use web products if available, else internal catalog)
      let productContextStr = "";
      if (webProductCount > 0) {
        // Show first 100 products as sample for AI context
        const sample = webProducts.slice(0, 100);
        productContextStr = sample.map((p: any) =>
          `- ${p.brandName}${p.composition ? ` (${p.composition.substring(0, 60)})` : ""}`
        ).join("\n");
        productContextStr += webProductCount > 100 ? `\n... and ${webProductCount - 100} more products` : "";
      }

      const systemPrompt = `You are a helpful CRM assistant for Cafoli Lifecare, a pharmaceutical company (website: https://cafoli.in).
You are chatting with a lead on WhatsApp.

${webProductCount > 0 ? `Cafoli has ${webProductCount} products. Sample:\n${productContextStr}` : "Cafoli has a large product range at https://cafoli.in"}

Available Range PDFs: ${pdfNames}

Your goal is to assist the lead, answer questions, and provide product information.

PRODUCT QUERIES: When the user asks about any product (Cafoli brand or competitor brand), use the "send_product" action. The system will automatically look up the product on cafoli.in website.

You can perform the following actions by returning a JSON object:
1. Reply with text: { "action": "reply", "text": "your message" }
2. Send a product (any product query - Cafoli or competitor): { "action": "send_product", "text": "optional intro message", "resource_name": "the product name or molecule the user asked about" }
3. Send a PDF: { "action": "send_pdf", "text": "optional caption", "resource_name": "exact pdf name from list above" }
4. Send full catalogue (link + all PDFs): { "action": "send_full_catalogue", "text": "optional message" }
5. Request human intervention (if you can't help): { "action": "intervention_request", "text": "I will connect you with an agent.", "reason": "reason" }
6. Request contact (if they want a meeting/call): { "action": "contact_request", "text": "I've noted your request.", "reason": "reason" }

RULES:
- For send_product, resource_name should be the product name or molecule the user mentioned.
- When the user asks for "full catalogue", "complete catalogue", "all products", use send_full_catalogue.
- For general questions not about products, use reply.

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
        logAiInfo("SEND_PRODUCT", `Looking up product: "${aiAction.resource_name}"`, { leadId: args.leadId });

        let productSent = false;

        // Step 1: Try to find in cached web products DB (fast, no network)
        const webMatch = findWebProductByQuery(webProducts, aiAction.resource_name || args.prompt);
        if (webMatch) {
          logAiInfo("SEND_PRODUCT", `Found in web products DB: ${webMatch.brandName}`, { leadId: args.leadId });
          
          // Fetch the product page for full details (image, PDF, price)
          const html = await fetchPageHtml(webMatch.pageUrl);
          let details = extractProductDetailsFromHtml(html, webMatch.pageUrl);
          
          // Use cached data as fallback
          if (!details.imageUrl && webMatch.imageUrl) details = { ...details, imageUrl: webMatch.imageUrl };
          if (!details.pdfUrl && webMatch.pdfUrl) details = { ...details, pdfUrl: webMatch.pdfUrl };
          if (!details.mrp && webMatch.mrp) details = { ...details, mrp: webMatch.mrp };
          if (!details.packaging && webMatch.packaging) details = { ...details, packaging: webMatch.packaging };
          if (!details.name) details = { ...details, name: webMatch.brandName };
          if (!details.molecule && webMatch.composition) details = { ...details, molecule: webMatch.composition };
          
          await sendWebsiteProductToLead(ctx, details, { leadId: args.leadId, phoneNumber: args.phoneNumber }, aiAction.text);
          productSent = true;
        }

        // Step 2: If not in DB, try live sitemap lookup
        if (!productSent) {
          logAiInfo("SEND_PRODUCT", `Not in DB, trying live sitemap lookup`, { leadId: args.leadId });
          const sitemapUrls = await fetchCafoliSitemap();
          
          if (sitemapUrls.length > 0) {
            const productUrl = await findBestProductUrl(ctx, `${aiAction.resource_name} ${args.prompt}`, sitemapUrls);
            
            if (productUrl) {
              const html = await fetchPageHtml(productUrl);
              if (html) {
                const details = extractProductDetailsFromHtml(html, productUrl);
                if (details.name || details.imageUrl) {
                  logAiInfo("SEND_PRODUCT", `Found via sitemap: ${details.name}`, { leadId: args.leadId });
                  await sendWebsiteProductToLead(ctx, details, { leadId: args.leadId, phoneNumber: args.phoneNumber }, aiAction.text);
                  productSent = true;
                }
              }
            }
          }
        }

        // Step 3: Fallback to internal catalog
        if (!productSent) {
          logAiInfo("SEND_PRODUCT", `Trying internal catalog fallback`, { leadId: args.leadId });
          const products = await ctx.runQuery(internal.products.listProductsInternal);
          const resourceLower = (aiAction.resource_name || "").toLowerCase();
          const promptLower = args.prompt.toLowerCase();

          let product = products.find((p: any) => p.name?.toLowerCase() === resourceLower);
          if (!product) product = products.find((p: any) => p.name?.toLowerCase().includes(resourceLower) || resourceLower.includes(p.name?.toLowerCase() || ""));
          if (!product) product = products.find((p: any) => p.molecule && (p.molecule.toLowerCase().includes(resourceLower) || resourceLower.includes(p.molecule.toLowerCase())));
          if (!product) product = products.find((p: any) => p.molecule && (p.molecule.toLowerCase().includes(promptLower) || promptLower.includes(p.molecule.toLowerCase())));

          if (product) {
            logAiInfo("SEND_PRODUCT", `Found in internal catalog: ${product.name}`, { leadId: args.leadId });
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
            aiDraftedMessage: `Customer asked for "${aiAction.resource_name}" but no matching product was found. Please assist.`,
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