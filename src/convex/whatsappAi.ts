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
// Uses correct patterns matching actual cafoli.in HTML structure
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
  // Brand name: <div class="med-name">...<h2 class="w-100" style="...">BRAND NAME</h2>
  const brandNameMatch = html.match(/<div[^>]*class="med-name"[^>]*>[\s\S]{0,300}?<h2[^>]*>([^<]+)<\/h2>/i);
  const name = brandNameMatch ? brandNameMatch[1].trim() : null;

  // Composition: <p class="com-name" id="more_paragraph"><b class="c-name">Composition : </b>TEXT</p>
  const compositionMatch =
    html.match(/<p[^>]*class="com-name"[^>]*>[\s\S]*?<b[^>]*class="c-name"[^>]*>Composition\s*:\s*<\/b>\s*([^<]+)/i) ||
    html.match(/Composition\s*:\s*<\/b>\s*([^<\n]{5,300})/i) ||
    html.match(/<b[^>]*>Composition\s*:\s*<\/b>\s*([^<\n]{5,300})/i);
  const molecule = compositionMatch ? compositionMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // MRP: <p><b>Price : </b><span style="font-weight: bold;">₹655/-</span></p>
  const mrpMatch =
    html.match(/Price\s*:\s*<\/b>\s*<span[^>]*>[\s]*[₹Rs\.]*\s*(\d+(?:\.\d+)?)\s*\/-/i) ||
    html.match(/[₹]\s*(\d+(?:\.\d+)?)\s*\/-/i) ||
    html.match(/Price\s*:\s*[₹Rs\.]*\s*(\d+)/i);
  const mrp = mrpMatch ? mrpMatch[1] : null;

  // Packaging (size): <p><b>Packaging : </b>10x1x10</p> — must NOT match "Packaging Type"
  const packagingMatches = [...html.matchAll(/<b[^>]*>Packaging\s*:\s*<\/b>\s*([^<\n]{1,100})/gi)];
  const packagingMatch = packagingMatches.find(m => !m[0].toLowerCase().includes("type"));
  const packaging = packagingMatch ? packagingMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // Description: from <div class="panel"> accordion content
  let description: string | null = null;
  const panelIdx = html.indexOf('<div class="panel">');
  if (panelIdx >= 0) {
    const panelContent = html.substring(panelIdx + '<div class="panel">'.length, panelIdx + 5000);
    const plainText = panelContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (plainText.length > 20) description = plainText.substring(0, 500);
  }
  if (!description) {
    const paraMatches = [...html.matchAll(/<p[^>]*style="[^"]*text-align:\s*justify[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)];
    if (paraMatches.length > 0) {
      description = paraMatches[0][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 500);
    }
  }

  // Images: handles relative paths like ../../Static/V1/OtherPageImages/NAME WITH SPACES.webp
  const imageRegex = /src="((?:https:\/\/cafoli\.in\/)?(?:\.\.\/)*Static\/V1\/OtherPageImages\/[^"]+?\.webp)"/gi;
  const imageMatches = [...html.matchAll(imageRegex)];
  const allImages = imageMatches
    .map(m => {
      const src = m[1];
      if (src.startsWith("http")) return src;
      const idx = src.indexOf("Static/V1/OtherPageImages/");
      return idx >= 0 ? `https://cafoli.in/${src.substring(idx)}` : null;
    })
    .filter((url): url is string => !!url && url.includes("OtherPageImages"));
  const seenImages = new Set<string>();
  const uniqueImages: string[] = [];
  for (const img of allImages) {
    if (!seenImages.has(img)) { seenImages.add(img); uniqueImages.push(img); }
  }
  const imageUrl = uniqueImages[0] || null;

  // PDFs: handles relative paths like ../Static/V1/OtherPagepdf/NAME WITH SPACES.pdf
  const pdfRegex = /href="((?:https:\/\/cafoli\.in\/)?(?:\.\.\/)*Static\/V1\/OtherPagepdf\/[^"]+?\.pdf)"/gi;
  const pdfMatches = [...html.matchAll(pdfRegex)];
  const allPdfs = pdfMatches
    .map(m => {
      const src = m[1];
      if (src.startsWith("http")) return src;
      const idx = src.indexOf("Static/V1/OtherPagepdf/");
      return idx >= 0 ? `https://cafoli.in/${src.substring(idx)}` : null;
    })
    .filter((url): url is string => !!url && url.includes("OtherPagepdf"));
  const seenPdfs = new Set<string>();
  const uniquePdfs: string[] = [];
  for (const pdf of allPdfs) {
    if (!seenPdfs.has(pdf)) { seenPdfs.add(pdf); uniquePdfs.push(pdf); }
  }
  const pdfUrl = uniquePdfs[0] || null;

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
  const q = query.toLowerCase().trim();
  
  // Exact brand name match (case-insensitive)
  let match = webProducts.find((p: any) => p.brandName?.toLowerCase() === q);
  if (match) return match;
  
  // Brand name starts with query
  match = webProducts.find((p: any) => p.brandName?.toLowerCase().startsWith(q));
  if (match) return match;
  
  // Query starts with brand name (e.g. "Lubicom Eye Drop" matches "Lubicom")
  match = webProducts.find((p: any) => {
    const bn = p.brandName?.toLowerCase() || "";
    return bn.length > 3 && q.startsWith(bn);
  });
  if (match) return match;
  
  // Brand name contains query
  match = webProducts.find((p: any) => p.brandName?.toLowerCase().includes(q));
  if (match) return match;
  
  // Query contains brand name
  match = webProducts.find((p: any) => {
    const bn = p.brandName?.toLowerCase() || "";
    return bn.length > 3 && q.includes(bn);
  });
  if (match) return match;
  
  // Composition/molecule exact match
  match = webProducts.find((p: any) => {
    const comp = p.composition?.toLowerCase() || "";
    return comp && comp === q;
  });
  if (match) return match;
  
  // Composition contains query (molecule search)
  match = webProducts.find((p: any) => {
    const comp = p.composition?.toLowerCase() || "";
    return comp && comp.includes(q) && q.length > 5;
  });
  if (match) return match;
  
  // Query contains key part of composition
  match = webProducts.find((p: any) => {
    const comp = p.composition?.toLowerCase() || "";
    if (!comp || comp.length < 5) return false;
    // Extract first molecule name (before + or ,)
    const firstMolecule = comp.split(/[+,]/)[0].trim();
    return firstMolecule.length > 5 && q.includes(firstMolecule);
  });
  if (match) return match;
  
  return null;
}

// Send a website-sourced product to the lead
// Note: cafoli.in images/PDFs are loaded via JS and cannot be scraped statically.
// We send text info + page link only.
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
  // Filter out invalid MRP values (0, "0", etc.)
  const validMrp = productDetails.mrp && productDetails.mrp !== "0" && productDetails.mrp !== "0.00" ? productDetails.mrp : null;

  // Build product details text
  const lines = [
    introText || null,
    productDetails.name ? `*${productDetails.name}*` : null,
    productDetails.molecule ? `Composition: ${productDetails.molecule}` : null,
    validMrp ? `MRP: ₹${validMrp}` : `MRP: Contact us for pricing`,
    productDetails.packaging ? `Packaging: ${productDetails.packaging}` : null,
    productDetails.description ? `\n${productDetails.description.substring(0, 300)}` : null,
    `\nMore info & images: ${productDetails.pageLink}`,
  ].filter(Boolean);

  const detailsMessage = lines.join("\n");

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

  const validMrpCatalog = product.mrp && product.mrp !== "0" && product.mrp !== "0.00" ? product.mrp : null;
  const detailsMessage = [
    `*${product.name}*`,
    product.molecule ? `Molecule: ${product.molecule}` : null,
    validMrpCatalog ? `MRP: ₹${validMrpCatalog}` : `MRP: Contact us for pricing`,
    product.packaging ? `Packaging: ${product.packaging}` : null,
    product.description ? `\n${product.description}` : null,
    product.pageLink ? `\nMore info & images: ${product.pageLink}` : null,
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
      const webProducts = await ctx.runQuery("cafoliScraperDb:listWebProducts" as any);
      const webProductCount = webProducts.length;

      // Build product list for AI context - include all products with brand + composition
      let productContextStr = "";
      if (webProductCount > 0) {
        productContextStr = webProducts.map((p: any) =>
          `${p.brandName}${p.composition ? ` | ${p.composition.substring(0, 80)}` : ""}`
        ).join("\n");
      }

      const systemPrompt = `You are a helpful CRM assistant for Cafoli Lifecare, a pharmaceutical company (website: https://cafoli.in).
You are chatting with a lead on WhatsApp.

${webProductCount > 0 ? `Cafoli has ${webProductCount} products in their catalog. Full product list (BrandName | Composition):\n${productContextStr}` : "Cafoli has a large product range at https://cafoli.in"}

Available Range PDFs: ${pdfNames}

Your goal is to assist the lead, answer questions, and provide product information.

PRODUCT QUERIES: When the user asks about any product — whether by Cafoli brand name, molecule/composition, or a COMPETITOR brand name — use the "send_product" action with the EXACT Cafoli brand name from the product list above that best matches.

FOLLOW-UP QUESTIONS: If the lead asks for "image", "photo", "picture", "MRP", "price", "packaging" about a product already discussed in the conversation, use "send_product" again with that same product name to resend the full product info. Do NOT use "reply" to say you can't provide images — always use "send_product" to share the product page link where they can see images.

COMPETITOR BRAND MATCHING (CRITICAL):
- Many leads will ask for competitor brand names (e.g., "Vonogate", "Pan D", "Pantop", "Omez", "Dolo", etc.)
- You MUST identify the active molecule/composition of the competitor brand and find the Cafoli equivalent
- Examples:
  - "Vonogate" → Vonoprazan → find Cafoli product with Vonoprazan in composition
  - "Pan D" → Pantoprazole + Domperidone → find Cafoli product with same molecules
  - "Dolo 650" → Paracetamol 650mg → find Cafoli product with Paracetamol
  - "Augmentin" → Amoxicillin + Clavulanate → find Cafoli product with same molecules
- ALWAYS try to match competitor brands to Cafoli equivalents before using intervention_request

You can perform the following actions by returning a JSON object:
1. Reply with text: { "action": "reply", "text": "your message" }
2. Send a product: { "action": "send_product", "text": "optional intro message", "resource_name": "EXACT Cafoli brand name from the product list above" }
3. Send a PDF: { "action": "send_pdf", "text": "optional caption", "resource_name": "exact pdf name from list above" }
4. Send full catalogue (link + all PDFs): { "action": "send_full_catalogue", "text": "optional message" }
5. Request human intervention (if you truly can't find any matching product): { "action": "intervention_request", "text": "I will connect you with an agent.", "reason": "reason" }
6. Request contact (if they want a meeting/call): { "action": "contact_request", "text": "I've noted your request.", "reason": "reason" }

RULES:
- For send_product, resource_name MUST be the exact Cafoli brand name from the product list.
- ALWAYS try competitor brand → molecule → Cafoli equivalent matching before giving up.
- Only use intervention_request if NO Cafoli product matches the molecule at all.
- When the user asks for "full catalogue", "complete catalogue", "all products", use send_full_catalogue.
- For general questions not about products, use reply.

Always return ONLY the JSON object. Do not include other text.`;

      // Format context as readable conversation history
      const context = args.context || {};
      const recentMessages: Array<{ role: string; content: string }> = context.recentMessages || [];
      const contactRequestMessage: string | undefined = context.contactRequestMessage;

      let conversationHistory = "";
      if (recentMessages.length > 0) {
        conversationHistory = "Recent conversation:\n" + recentMessages.map((m: any) => {
          const role = m.role === "assistant" ? "Agent" : "Lead";
          return `${role}: ${m.content}`;
        }).join("\n") + "\n\n";
      }

      const contactRequestNote = contactRequestMessage
        ? `\nNote: If the lead requests a callback/contact, use this message: "${contactRequestMessage}"\n`
        : "";

      const userPrompt = `${conversationHistory}${contactRequestNote}Latest message from lead: "${args.prompt}"`;

      const { text: rawText } = await generateWithGemini(ctx, systemPrompt, userPrompt, { jsonMode: true });
      logAiInfo("REPLY", "Raw AI response", { rawText: rawText.substring(0, 200) });

      const jsonStr = extractJsonFromMarkdown(rawText);
      const aiAction = JSON.parse(jsonStr);
      logAiInfo("REPLY", "Parsed AI action", { action: aiAction.action, resource: aiAction.resource_name });

      if (aiAction.action === "reply") {
        await ctx.runAction(internal.whatsapp.internal.sendMessage, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          message: aiAction.text,
          quotedMessageExternalId: args.replyingToExternalId,
        });

      } else if (aiAction.action === "send_product") {
        logAiInfo("SEND_PRODUCT", `Looking up product: "${aiAction.resource_name}"`, { leadId: args.leadId });

        let productSent = false;

        // Step 1: Try to find in cached web products DB (fast, no network)
        const webMatch = findWebProductByQuery(webProducts, aiAction.resource_name || args.prompt);
        if (webMatch) {
          logAiInfo("SEND_PRODUCT", `Found in web products DB: ${webMatch.brandName}`, { leadId: args.leadId });

          // Check if DB data is corrupted or missing key fields
          const isCorruptedComposition = webMatch.composition && (
            webMatch.composition.toLowerCase().includes("guide") ||
            webMatch.composition.toLowerCase().includes("franchise") ||
            webMatch.composition.toLowerCase().includes("pcd pharma") ||
            webMatch.composition.includes("'>") ||
            webMatch.composition.includes("</") ||
            webMatch.composition.length > 300
          );
          const hasGoodDbData = !isCorruptedComposition;

          let details: { name: string | null; molecule: string | null; mrp: string | null; packaging: string | null; description: string | null; imageUrl: string | null; pdfUrl: string | null; pageLink: string };

          if (hasGoodDbData) {
            // Use DB data directly — correctly scraped
            details = {
              name: webMatch.brandName,
              molecule: webMatch.composition || null,
              mrp: webMatch.mrp || null,
              packaging: webMatch.packaging || null,
              description: webMatch.description || null,
              imageUrl: webMatch.imageUrl || (webMatch.imageUrls && webMatch.imageUrls[0]) || null,
              pdfUrl: webMatch.pdfUrl || null,
              pageLink: webMatch.pageUrl,
            };
          } else {
            // DB data is stale/corrupted — fetch live from the product page
            logAiInfo("SEND_PRODUCT", `DB data stale/corrupted, fetching live page: ${webMatch.pageUrl}`, { leadId: args.leadId });
            const html = await fetchPageHtml(webMatch.pageUrl);
            if (html) {
              const liveDetails = extractProductDetailsFromHtml(html, webMatch.pageUrl);
              details = {
                name: liveDetails.name || webMatch.brandName,
                molecule: isCorruptedComposition ? liveDetails.molecule : (webMatch.composition || liveDetails.molecule),
                mrp: liveDetails.mrp || webMatch.mrp || null,
                packaging: liveDetails.packaging || webMatch.packaging || null,
                description: liveDetails.description || webMatch.description || null,
                imageUrl: liveDetails.imageUrl || webMatch.imageUrl || null,
                pdfUrl: liveDetails.pdfUrl || webMatch.pdfUrl || null,
                pageLink: webMatch.pageUrl,
              };
            } else {
              // Page fetch failed, use whatever DB data we have
              details = {
                name: webMatch.brandName,
                molecule: isCorruptedComposition ? null : (webMatch.composition || null),
                mrp: webMatch.mrp || null,
                packaging: webMatch.packaging || null,
                description: webMatch.description || null,
                imageUrl: webMatch.imageUrl || null,
                pdfUrl: webMatch.pdfUrl || null,
                pageLink: webMatch.pageUrl,
              };
            }
          }

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