"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { generateWithGemini, generateWithGeminiVision, analyzeMedia, extractJsonFromMarkdown } from "./lib/gemini";

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
  
  // Query starts with brand name
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

  // Word-level match: first word of query matches first word of brand name
  const qFirstWord = q.split(/\s+/)[0];
  if (qFirstWord && qFirstWord.length > 3) {
    match = webProducts.find((p: any) => {
      const bn = p.brandName?.toLowerCase() || "";
      const bnFirstWord = bn.split(/\s+/)[0];
      return bnFirstWord === qFirstWord;
    });
    if (match) return match;
  }

  // Word-level match: first word of brand name (>6 chars) appears as whole word in query
  match = webProducts.find((p: any) => {
    const bn = p.brandName?.toLowerCase() || "";
    const bnFirstWord = bn.split(/\s+/)[0];
    if (bnFirstWord.length <= 6) return false;
    return q.split(/\s+/).includes(bnFirstWord);
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
    const firstMolecule = comp.split(/[+,]/)[0].trim();
    return firstMolecule.length > 5 && q.includes(firstMolecule);
  });
  if (match) return match;

  // Molecule word-level: any word in query matches first molecule word
  const qWords = q.split(/\s+/).filter((w: string) => w.length > 4);
  match = webProducts.find((p: any) => {
    const comp = p.composition?.toLowerCase() || "";
    if (!comp) return false;
    const firstMolecule = comp.split(/[+,]/)[0].trim().split(/\s+/)[0];
    return firstMolecule.length > 4 && qWords.includes(firstMolecule);
  });
  if (match) return match;
  
  return null;
}
// Use Gemini to fuzzy-match a product name against the full web products list
async function geminiProductFuzzyMatch(ctx: any, query: string, webProducts: any[]): Promise<any | null> {
  if (!webProducts || webProducts.length === 0) return null;
  try {
    const productList = webProducts.map((p: any) =>
      `${p.brandName}${p.composition ? ` | ${p.composition.substring(0, 60)}` : ""}`
    ).join("\n");
    const systemPrompt = `You are a pharmaceutical expert. Given a product query, find the single best matching Cafoli brand name from the list below.
Return ONLY a JSON object: { "brandName": "ExactBrandName" } or { "brandName": null } if no reasonable match exists.

STRICT MATCHING RULES:
- The query may be a competitor brand, molecule name, or partial Cafoli brand name.
- Match ONLY by: exact molecule/composition match, or clear brand name similarity.
- If the query is a molecule name (e.g. "Clonazepam"), ONLY match a product whose composition contains that exact molecule.
- If the query is a brand name, ONLY match a product whose brand name is clearly similar.
- Do NOT match based on vague therapeutic category alone.
- If no product clearly matches the molecule or brand name, return { "brandName": null }.
- NEVER return a product that doesn't contain the queried molecule in its composition.`;
    const { text } = await generateWithGemini(ctx, systemPrompt,
      `Query: "${query}"\n\nCafoli products (BrandName | Composition):\n${productList}`,
      { jsonMode: true }
    );
    const jsonStr = extractJsonFromMarkdown(text);
    const parsed = JSON.parse(jsonStr);
    if (!parsed.brandName) return null;
    // Find the product by exact brand name
    return webProducts.find((p: any) => p.brandName === parsed.brandName) || null;
  } catch (e) {
    logAiError("GEMINI_FUZZY_MATCH", e);
    return null;
  }
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

// ─── In-memory cache for web products (10-minute TTL) ────────────────────────
let _webProductsCache: any[] | null = null;
let _webProductsCacheTime = 0;
const WEB_PRODUCTS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getCachedWebProducts(ctx: any): Promise<any[]> {
  const now = Date.now();
  if (_webProductsCache && now - _webProductsCacheTime < WEB_PRODUCTS_CACHE_TTL) {
    return _webProductsCache;
  }
  const products = await ctx.runQuery("cafoliScraperDb:listWebProducts" as any);
  _webProductsCache = products || [];
  _webProductsCacheTime = now;
  return _webProductsCache!;
}

// ─── Token-windowed context builder ───────────────────────────────────────────
// Estimates tokens as chars/4. Keeps the last ~100k tokens as "recent".
// Older messages are summarized with Gemini into a compact summary.
const RECENT_TOKEN_BUDGET = 100_000;
const CHARS_PER_TOKEN = 4;

export const buildTokenWindowedContext = internalAction({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args): Promise<{
    summary: string;
    recentMessages: Array<{ role: string; content: string }>;
  }> => {
    const allMessages: any[] = await ctx.runQuery(
      internal.whatsappQueries.getChatMessagesInternal,
      { leadId: args.leadId }
    );

    if (!allMessages || allMessages.length === 0) {
      return { summary: "", recentMessages: [] };
    }

    // Convert to role/content pairs
    const formatted = allMessages.map((m: any) => ({
      role: m.direction === "outbound" ? "assistant" : "user",
      content: m.content || (m.messageType ? `[${m.messageType}]` : "[media]"),
    }));

    // Walk from the end, accumulate until we hit the token budget
    let tokenCount = 0;
    let splitIdx = formatted.length; // index where "recent" starts

    for (let i = formatted.length - 1; i >= 0; i--) {
      const msgTokens = Math.ceil(formatted[i].content.length / CHARS_PER_TOKEN);
      if (tokenCount + msgTokens > RECENT_TOKEN_BUDGET) {
        splitIdx = i + 1;
        break;
      }
      tokenCount += msgTokens;
      splitIdx = i;
    }

    const olderMessages = formatted.slice(0, splitIdx);
    const recentMessages = formatted.slice(splitIdx);

    // If there are older messages, summarize them
    let summary = "";
    if (olderMessages.length > 0) {
      try {
        const olderText = olderMessages
          .map((m) => `${m.role === "assistant" ? "Agent" : "Lead"}: ${m.content}`)
          .join("\n");

        const { text } = await generateWithGemini(
          ctx,
          `You are a CRM assistant. Summarize the following older WhatsApp conversation between an Agent and a Lead for a pharmaceutical company (Cafoli Lifecare). Be concise. Highlight: products discussed, lead's requirements, location, any commitments made, and pending actions.`,
          `Conversation to summarize:\n${olderText}`,
        );
        summary = text.trim();
      } catch (e) {
        logAiError("BUILD_CONTEXT_SUMMARY", e);
        // Fallback: use a truncated version
        summary = `[Earlier conversation with ${olderMessages.length} messages — summary unavailable]`;
      }
    }

    return { summary, recentMessages };
  },
});

export const generateChatSummary = action({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args): Promise<string> => {
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
  handler: async (ctx, args): Promise<void> => {
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
  handler: async (ctx, args): Promise<void> => {
    try {
      logAiInfo("REPLY", "Starting AI reply generation", { leadId: args.leadId, prompt: args.prompt.substring(0, 80) });

      const rangePdfs = await ctx.runQuery(internal.rangePdfs.listRangePdfsInternal);
      const pdfNames = rangePdfs.map((p: any) => p.name).join(", ");

      // Load cached web products for fast matching
      const webProducts = await getCachedWebProducts(ctx);
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

LANGUAGE RULE (CRITICAL): Always respond in the SAME language the lead is using. If they write in Hindi, respond in Hindi. If they write in English, respond in English. If they mix languages, match their style. Never switch languages unless the lead does first.

${webProductCount > 0 ? `Cafoli has ${webProductCount} products in their catalog. Full product list (BrandName | Composition):\n${productContextStr}` : "Cafoli has a large product range at https://cafoli.in"}

Available Range PDFs: ${pdfNames}

Your goal is to assist the lead, answer questions, and provide product information.

PRODUCT QUERIES: When the user asks about any product — whether by Cafoli brand name, molecule/composition, or a COMPETITOR brand name — use the "send_product" action with the EXACT Cafoli brand name from the product list above that best matches.

IMAGE / PHOTO MESSAGES: When the lead sends an image (e.g. "[User sent an image]"), they may be showing a product label or asking about a product in the image. Ask them to type the product name or composition so you can look it up. Use the "reply" action for this. Do NOT use "send_product" with a null or unknown resource_name.

FOLLOW-UP QUESTIONS: If the lead asks for "image", "photo", "picture", "MRP", "price", "packaging" about a product already discussed in the conversation, use "send_product" again with that same product name to resend the full product info. Do NOT use "reply" to say you can't provide images — always use "send_product" to share the product page link where they can see images.

PRODUCT LIST / CATALOGUE REQUESTS (CRITICAL): When the user asks for "product list", "product catalogue", "all products", "range", "price list", "full list", "send list", "send catalogue", "send range", "send PDF", "send all PDFs", or any similar request for a list/catalogue of products — ALWAYS use "send_full_catalogue" action. NEVER reply with a text message for these requests. The send_full_catalogue action will automatically send all Range PDFs.

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
- When the user asks for "full catalogue", "complete catalogue", "all products", "product list", "price list", "range", "send list", "send PDF", "send range", use send_full_catalogue.
- NEVER use "reply" action for product list/catalogue requests — always use send_full_catalogue.
- For general questions not about products, use reply.

Always return ONLY the JSON object. Do not include other text.`;

      // Build conversation history from context (supports both old format and new token-windowed format)
      const context = args.context || {};
      const recentMessages: Array<{ role: string; content: string }> = context.recentMessages || [];
      const olderSummary: string = context.summary || "";
      const contactRequestMessage: string | undefined = context.contactRequestMessage;

      let conversationHistory = "";

      // Include older summary if present
      if (olderSummary) {
        conversationHistory += `[Summary of earlier conversation]\n${olderSummary}\n\n`;
      }

      // Include recent messages
      if (recentMessages.length > 0) {
        conversationHistory += "Recent conversation:\n" + recentMessages.map((m: any) => {
          const role = m.role === "assistant" ? "Agent" : "Lead";
          return `${role}: ${m.content}`;
        }).join("\n") + "\n\n";
      }

      const contactRequestNote = contactRequestMessage
        ? `\nNote: If the lead requests a callback/contact, use this message: "${contactRequestMessage}"\n`
        : "";

      const userPrompt = `${conversationHistory}${contactRequestNote}Latest message from lead: "${args.prompt}"`;

      // Universal media analysis — handles images, audio, video, documents
      const imageUrl: string | undefined = context.imageUrl;
      const mediaUrl: string | undefined = context.mediaUrl;
      const mediaType: string | undefined = context.mediaType;
      const mediaMimeType: string | undefined = context.mediaMimeType;

      // Determine the effective media URL and type
      const effectiveMediaUrl = mediaUrl || imageUrl;
      const effectiveMediaType = mediaType || (imageUrl ? "image" : undefined);

      let rawText: string;
      if (effectiveMediaUrl && effectiveMediaType) {
        logAiInfo("REPLY", `Analyzing ${effectiveMediaType} media with Claude`, { leadId: args.leadId, mediaType: effectiveMediaType });

        // Build media-type-specific system prompt additions
        const mediaSystemAdditions: Record<string, string> = {
          image: `\n\nIMAGE ANALYSIS: The lead has sent an image. Analyze it to identify any pharmaceutical product, medicine, or product label. If you can identify a product name or molecule, use "send_product". If the image shows a product label, extract the brand name and/or molecule. If you cannot identify any product, use "reply" to ask the lead to type the product name.`,
          audio: `\n\nAUDIO MESSAGE: The lead has sent a voice/audio message. The transcription is included in the analysis. Respond based on what they said. If they mentioned a product name or molecule, use "send_product". If they asked for a catalogue, use "send_full_catalogue".`,
          document: `\n\nDOCUMENT: The lead has sent a document/PDF. Analyze its content. If it contains product names, prescriptions, or order details, respond accordingly. If they want product info, use "send_product".`,
          video: `\n\nVIDEO MESSAGE: The lead has sent a video. Acknowledge it warmly and ask them to describe what they're looking for or send a clearer image/text of the product they're interested in.`,
          file: `\n\nFILE: The lead has sent a file. Acknowledge it and ask how you can help them.`,
        };

        const mediaAddition = mediaSystemAdditions[effectiveMediaType] || mediaSystemAdditions.file;
        const mediaSystemPrompt = systemPrompt + mediaAddition;

        const result = await analyzeMedia(
          ctx,
          mediaSystemPrompt,
          userPrompt,
          effectiveMediaUrl,
          effectiveMediaType as "image" | "audio" | "video" | "document" | "file",
          mediaMimeType,
          { jsonMode: true }
        );
        rawText = result.text;

        // Log transcription for audio messages
        if (effectiveMediaType === "audio" && result.transcription) {
          logAiInfo("AUDIO_TRANSCRIPTION", `Transcribed: ${result.transcription.substring(0, 200)}`, { leadId: args.leadId });
        }
      } else {
        const result = await generateWithGemini(ctx, systemPrompt, userPrompt, { jsonMode: true });
        rawText = result.text;
      }
      logAiInfo("REPLY", "Raw AI response", { rawText: rawText.substring(0, 200) });

      const jsonStr = extractJsonFromMarkdown(rawText);
      const aiAction = JSON.parse(jsonStr);
      logAiInfo("REPLY", "Parsed AI action", { action: aiAction.action, resource: aiAction.resource_name });

      // Guard: if send_product has no resource_name, fall back to asking the lead
      if (aiAction.action === "send_product" && !aiAction.resource_name) {
        logAiInfo("SEND_PRODUCT", "resource_name is null/empty — asking lead to clarify", { leadId: args.leadId });
        await ctx.runAction(internal.whatsapp.internal.sendMessage, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          message: "Could you please type the name of the product or its composition? I'll look it up for you right away! 😊",
        });
        return;
      }

      if (aiAction.action === "reply") {
        await ctx.runAction(internal.whatsapp.internal.sendMessage, {
          leadId: args.leadId,
          phoneNumber: args.phoneNumber,
          message: aiAction.text,
        });
      } else if (aiAction.action === "send_product") {
        logAiInfo("SEND_PRODUCT", `Looking up product: "${aiAction.resource_name}"`, { leadId: args.leadId });

        let productSent = false;

        // Step 1: Try to find in cached web products DB (fast, no network)
        const webMatch = findWebProductByQuery(webProducts, aiAction.resource_name || args.prompt);
        if (webMatch) {
          logAiInfo("SEND_PRODUCT", `Found in web products DB: ${webMatch.brandName}`, { leadId: args.leadId });

          // Build details object from web product cache
          let details: { name: string | null; molecule: string | null; mrp: string | null; packaging: string | null; description: string | null; imageUrl: string | null; pdfUrl: string | null; pageLink: string };

          // Check if composition looks corrupted (contains HTML or is too long)
          const isCorruptedComposition = webMatch.composition && (
            webMatch.composition.includes("<") ||
            webMatch.composition.includes(">") ||
            webMatch.composition.length > 500
          );

          details = {
            name: webMatch.brandName || null,
            molecule: isCorruptedComposition ? null : (webMatch.composition || null),
            mrp: webMatch.mrp || null,
            packaging: webMatch.packaging || null,
            description: webMatch.description || null,
            imageUrl: webMatch.imageUrl || (webMatch.imageUrls && webMatch.imageUrls[0]) || null,
            pdfUrl: webMatch.pdfUrl || null,
            pageLink: webMatch.pageUrl || `https://cafoli.in`,
          };

          // Try to enrich with live data if we have a page URL
          if (webMatch.pageUrl) {
            try {
              const html = await fetchPageHtml(webMatch.pageUrl);
              if (html) {
                const liveDetails = extractProductDetailsFromHtml(html, webMatch.pageUrl);
                // Merge: prefer live data but fall back to cached
                details = {
                  ...details,
                  mrp: liveDetails.mrp || webMatch.mrp || null,
                  packaging: liveDetails.packaging || webMatch.packaging || null,
                  description: liveDetails.description || webMatch.description || null,
                  imageUrl: liveDetails.imageUrl || webMatch.imageUrl || null,
                  pdfUrl: liveDetails.pdfUrl || webMatch.pdfUrl || null,
                };
              }
            } catch {
              // Use cached data only
              details = {
                name: webMatch.brandName || null,
                molecule: isCorruptedComposition ? null : (webMatch.composition || null),
                mrp: webMatch.mrp || null,
                packaging: webMatch.packaging || null,
                description: webMatch.description || null,
                imageUrl: webMatch.imageUrl || null,
                pdfUrl: webMatch.pdfUrl || null,
                pageLink: webMatch.pageUrl || `https://cafoli.in`,
              };
            }
          }

          if (details.name || details.imageUrl) {
            await sendWebsiteProductToLead(ctx, details, { leadId: args.leadId, phoneNumber: args.phoneNumber }, aiAction.text);
            productSent = true;
          }
        }

        // Step 1.5: Gemini-powered fuzzy match against full web products list
        if (!productSent) {
          logAiInfo("SEND_PRODUCT", `Trying Gemini fuzzy match for: "${aiAction.resource_name}"`, { leadId: args.leadId });
          const fuzzyMatch = await geminiProductFuzzyMatch(ctx, aiAction.resource_name || args.prompt, webProducts);
          if (fuzzyMatch) {
            logAiInfo("SEND_PRODUCT", `Gemini fuzzy matched: ${fuzzyMatch.brandName}`, { leadId: args.leadId });
            const isCorruptedComposition = fuzzyMatch.composition && (
              fuzzyMatch.composition.includes("<") ||
              fuzzyMatch.composition.includes(">") ||
              fuzzyMatch.composition.length > 500
            );
            let details = {
              name: fuzzyMatch.brandName || null,
              molecule: isCorruptedComposition ? null : (fuzzyMatch.composition || null),
              mrp: fuzzyMatch.mrp || null,
              packaging: fuzzyMatch.packaging || null,
              description: fuzzyMatch.description || null,
              imageUrl: fuzzyMatch.imageUrl || (fuzzyMatch.imageUrls && fuzzyMatch.imageUrls[0]) || null,
              pdfUrl: fuzzyMatch.pdfUrl || null,
              pageLink: fuzzyMatch.pageUrl || `https://cafoli.in`,
            };
            if (fuzzyMatch.pageUrl) {
              try {
                const html = await fetchPageHtml(fuzzyMatch.pageUrl);
                if (html) {
                  const liveDetails = extractProductDetailsFromHtml(html, fuzzyMatch.pageUrl);
                  details = {
                    ...details,
                    mrp: liveDetails.mrp || fuzzyMatch.mrp || null,
                    packaging: liveDetails.packaging || fuzzyMatch.packaging || null,
                    description: liveDetails.description || fuzzyMatch.description || null,
                    imageUrl: liveDetails.imageUrl || fuzzyMatch.imageUrl || null,
                    pdfUrl: liveDetails.pdfUrl || fuzzyMatch.pdfUrl || null,
                  };
                }
              } catch { /* use cached */ }
            }
            if (details.name || details.pageLink) {
              await sendWebsiteProductToLead(ctx, details, { leadId: args.leadId, phoneNumber: args.phoneNumber }, aiAction.text);
              productSent = true;
            }
          }
        }

        // Step 2: Try sitemap search if not found in DB
        if (!productSent) {
          logAiInfo("SEND_PRODUCT", `Not in web products DB, trying sitemap`, { leadId: args.leadId });
          const sitemapUrls = await fetchCafoliSitemap();
          if (sitemapUrls.length > 0) {
            const productUrl = await findBestProductUrl(ctx, aiAction.resource_name || args.prompt, sitemapUrls);
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

      // ─── Questionnaire: send after first AI reply if not yet sent ───────────
      // Only send for auto-replies (not manual staff replies), and only once per lead
      if (args.isAutoReply) {
        try {
          const lead = await ctx.runQuery(internal.leads.queries.basic.getLeadByIdInternal, { leadId: args.leadId });
          if (lead && !lead.questionnaireSentAt) {
            // Check if there's been at least 1 prior exchange (recentMessages has content)
            const hasExchange = recentMessages.length >= 1;
            if (hasExchange) {
              logAiInfo("QUESTIONNAIRE", "Sending questionnaire to lead", { leadId: args.leadId });
              await new Promise(resolve => setTimeout(resolve, 1000));
              await ctx.runAction(internal.whatsapp.internal.sendMessage, {
                leadId: args.leadId,
                phoneNumber: args.phoneNumber,
                message: `Thank you for contacting us 🙏\n\nTo assist you better, kindly share the following details:\n\n1️⃣ Agency / Firm Name\n2️⃣ Marketing Area / Location\n3️⃣ Business Type (Wholesaler / Retailer / Doctor / Hospital / Distributor)\n4️⃣ Preferred Time for Call\n5️⃣ Alternate Contact Number (if any)\n6️⃣ Email ID\n\nOnce we receive your details, our team will connect with you shortly 👍`,
              });
              await ctx.runMutation(internal.questionnaire.markQuestionnaireSent, {
                leadId: args.leadId,
              });
            }
          }
        } catch (qErr) {
          logAiError("QUESTIONNAIRE", qErr, { leadId: args.leadId });
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

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