"use node";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Parse the allproduct.aspx HTML to extract product rows
function parseProductListHtml(html: string): Array<{ brandName: string; composition: string; pageUrl: string; imageUrl: string; dosageForm: string }> {
  const products: Array<{ brandName: string; composition: string; pageUrl: string; imageUrl: string; dosageForm: string }> = [];
  
  const firstTdRegex = /<td[^>]*class="first-all-p[^"]*"[^>]*>\s*<a\s+href='([^']+)'>([^<]+)<\/a>\s*<\/td>/gi;
  let firstTdMatch;
  
  while ((firstTdMatch = firstTdRegex.exec(html)) !== null) {
    const slug = firstTdMatch[1].trim();
    const brandName = firstTdMatch[2].trim();
    
    if (!brandName || brandName.length < 2 || !slug) continue;
    
    const pageUrl = `https://cafoli.in/${slug}`;
    const matchEnd = firstTdMatch.index + firstTdMatch[0].length;
    const nextChunk = html.substring(matchEnd, matchEnd + 600);
    
    const compMatch = nextChunk.match(/class="fixed-len">([^<]+)<\/a>/i);
    const rawComposition = compMatch ? compMatch[1].trim() : "";
    
    const isValidComposition = rawComposition &&
      rawComposition.length < 250 &&
      !rawComposition.toLowerCase().includes("guide") &&
      !rawComposition.toLowerCase().includes("franchise") &&
      !rawComposition.toLowerCase().includes("pcd") &&
      !rawComposition.toLowerCase().includes("pharma") &&
      !rawComposition.toLowerCase().includes("business") &&
      !rawComposition.toLowerCase().includes("company") &&
      !rawComposition.includes("'>") &&
      !rawComposition.includes("</");
    
    const composition = isValidComposition ? rawComposition : "";
    
    const dosageMatch = nextChunk.match(/class="fixed-len">[^<]+<\/a>\s*<\/td>\s*<td[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
    const dosageForm = dosageMatch ? dosageMatch[1].trim() : "";
    
    // Match image with spaces in filename allowed
    const imgChunk = html.substring(matchEnd, matchEnd + 800);
    const imgMatch = imgChunk.match(/src="(?:https:\/\/cafoli\.in\/)?(?:\.\.\/)*Static\/V1\/OtherPageImages\/([^"]+\.webp)"/i);
    const imageUrl = imgMatch ? `https://cafoli.in/Static/V1/OtherPageImages/${imgMatch[1]}` : "";
    
    products.push({ brandName, composition, pageUrl, imageUrl, dosageForm });
  }
  
  return products;
}

// Resolve a relative or absolute image/pdf URL to an absolute cafoli.in URL
function resolveUrl(src: string, type: "image" | "pdf"): string {
  if (!src) return "";
  if (src.startsWith("http")) return src;
  const staticPath = type === "image" ? "Static/V1/OtherPageImages/" : "Static/V1/OtherPagepdf/";
  const idx = src.indexOf(staticPath);
  if (idx >= 0) {
    return `https://cafoli.in/${src.substring(idx)}`;
  }
  // Strip leading ../
  const cleaned = src.replace(/^(\.\.\/)+/, "");
  return `https://cafoli.in/${cleaned}`;
}

// Extract product details from a product page HTML
// Based on actual HTML structure of cafoli.in product pages
function extractProductPageDetails(html: string): {
  brandName: string | null;
  composition: string | null;
  dosageForm: string | null;
  mrp: string | null;
  packaging: string | null;
  packagingType: string | null;
  description: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  pdfUrl: string | null;
  literaturePdfUrl: string | null;
} {
  // Brand name: <div class="med-name">...<h2 class="w-100" style="...">BRAND NAME</h2>
  const brandNameMatch = html.match(/<div[^>]*class="med-name"[^>]*>[\s\S]{0,300}?<h2[^>]*>([^<]+)<\/h2>/i);
  const brandName = brandNameMatch ? brandNameMatch[1].trim() : null;

  // Composition: <p class="com-name" id="more_paragraph"><b class="c-name">Composition : </b>TEXT</p>
  // The text is directly after </b> and before </p>
  const compositionMatch =
    html.match(/<p[^>]*class="com-name"[^>]*>[\s\S]*?<b[^>]*class="c-name"[^>]*>Composition\s*:\s*<\/b>\s*([^<]+)/i) ||
    html.match(/Composition\s*:\s*<\/b>\s*([^<\n]{5,300})/i) ||
    html.match(/<b[^>]*>Composition\s*:\s*<\/b>\s*([^<\n]{5,300})/i);
  const composition = compositionMatch ? compositionMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // Dosage Form: <p><b>Dosage Form : </b>Tablet</p>
  const dosageFormMatch = html.match(/<b[^>]*>Dosage\s*Form\s*:\s*<\/b>\s*([^<\n]{1,100})/i);
  const dosageForm = dosageFormMatch ? dosageFormMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // MRP: <p><b>Price : </b><span style="font-weight: bold;">₹655/-</span></p>
  const mrpMatch =
    html.match(/Price\s*:\s*<\/b>\s*<span[^>]*>[\s]*[₹Rs\.]*\s*(\d+(?:\.\d+)?)\s*\/-/i) ||
    html.match(/[₹]\s*(\d+(?:\.\d+)?)\s*\/-/i) ||
    html.match(/Price\s*:\s*[₹Rs\.]*\s*(\d+)/i);
  const mrp = mrpMatch ? mrpMatch[1] : null;

  // Packaging Type: <p><b>Packaging Type : </b>Blister</p>
  const packagingTypeMatch = html.match(/<b[^>]*>Packaging\s*Type\s*:\s*<\/b>\s*([^<\n]{1,100})/i);
  const packagingType = packagingTypeMatch ? packagingTypeMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // Packaging (size): <p><b>Packaging : </b>10x1x10</p>
  // Must NOT match "Packaging Type" - use negative lookahead equivalent by checking the match doesn't include "Type"
  const packagingMatches = [...html.matchAll(/<b[^>]*>Packaging\s*:\s*<\/b>\s*([^<\n]{1,100})/gi)];
  const packagingMatch = packagingMatches.find(m => !m[0].toLowerCase().includes("type"));
  const packaging = packagingMatch ? packagingMatch[1].replace(/<[^>]+>/g, "").trim() : null;

  // Description: <button id="dbtn" class="accordion">Description</button><div class="panel">...<p>TEXT</p>...</div>
  // The panel div contains nested <p> tags with the actual description text
  // Use a greedy match to get all content between panel div tags
  let description: string | null = null;
  const panelIdx = html.indexOf('<div class="panel">');
  if (panelIdx >= 0) {
    // Find the closing </div> for this panel - look for it after the opening
    const panelContent = html.substring(panelIdx + '<div class="panel">'.length, panelIdx + 5000);
    // Strip all HTML tags to get plain text
    const plainText = panelContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (plainText.length > 20) {
      description = plainText.substring(0, 600);
    }
  }
  if (!description) {
    // Fallback: justified paragraphs
    const paraMatches = [...html.matchAll(/<p[^>]*style="[^"]*text-align:\s*justify[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)];
    if (paraMatches.length > 0) {
      description = paraMatches[0][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 600);
    }
  }

  // Images: src="../../Static/V1/OtherPageImages/NAME WITH SPACES.webp"
  // Allow spaces and special chars in filename (everything up to .webp")
  const imageRegex = /src="((?:https:\/\/cafoli\.in\/)?(?:\.\.\/)*Static\/V1\/OtherPageImages\/[^"]+?\.webp)"/gi;
  const imageMatches = [...html.matchAll(imageRegex)];
  const allImages = imageMatches
    .map(m => resolveUrl(m[1], "image"))
    .filter(url => {
      const filename = url.split("/").pop() || "";
      // Must have a reasonable filename (not just a short name)
      return filename.length > 5 && url.includes("OtherPageImages");
    });
  // Deduplicate
  const seenImages = new Set<string>();
  const uniqueImages: string[] = [];
  for (const img of allImages) {
    if (!seenImages.has(img)) {
      seenImages.add(img);
      uniqueImages.push(img);
    }
  }
  const imageUrl = uniqueImages[0] || null;
  const imageUrls = uniqueImages.slice(0, 4); // Store up to 4 images

  // PDFs: href="../Static/V1/OtherPagepdf/NAME WITH SPACES.pdf"
  const pdfRegex = /href="((?:https:\/\/cafoli\.in\/)?(?:\.\.\/)*Static\/V1\/OtherPagepdf\/[^"]+?\.pdf)"/gi;
  const pdfMatches = [...html.matchAll(pdfRegex)];
  const pdfUrls = pdfMatches
    .map(m => resolveUrl(m[1], "pdf"))
    .filter(url => url.includes("OtherPagepdf"));
  // Deduplicate
  const seenPdfs = new Set<string>();
  const uniquePdfs: string[] = [];
  for (const pdf of pdfUrls) {
    if (!seenPdfs.has(pdf)) {
      seenPdfs.add(pdf);
      uniquePdfs.push(pdf);
    }
  }
  const pdfUrl = uniquePdfs[0] || null;
  const literaturePdfUrl = uniquePdfs[1] || null;

  return { brandName, composition, dosageForm, mrp, packaging, packagingType, description, imageUrl, imageUrls, pdfUrl, literaturePdfUrl };
}

export const listWebProductsPublic = action({
  args: {},
  handler: async (ctx): Promise<any[]> => {
    return await ctx.runQuery(internal.cafoliScraperDb.listWebProducts);
  },
});

// Scrape a batch of product detail pages
export const scrapeProductDetailsBatch = internalAction({
  args: {
    products: v.array(v.object({
      brandName: v.string(),
      composition: v.optional(v.string()),
      dosageForm: v.optional(v.string()),
      pageUrl: v.string(),
      imageUrl: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    let scraped = 0;
    let failed = 0;
    
    for (const product of args.products) {
      try {
        const res = await fetch(product.pageUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
          signal: AbortSignal.timeout(15000),
        });
        
        let details: ReturnType<typeof extractProductPageDetails> = {
          brandName: null,
          composition: null,
          dosageForm: null,
          mrp: null,
          packaging: null,
          packagingType: null,
          description: null,
          imageUrl: product.imageUrl || null,
          imageUrls: product.imageUrl ? [product.imageUrl] : [],
          pdfUrl: null,
          literaturePdfUrl: null,
        };
        
        if (res.ok) {
          const html = await res.text();
          details = extractProductPageDetails(html);
          if (!details.imageUrl && product.imageUrl) {
            details.imageUrl = product.imageUrl;
            details.imageUrls = [product.imageUrl];
          }
        }
        
        const finalComposition = details.composition || product.composition;
        const finalDosageForm = details.dosageForm || product.dosageForm;
        const finalBrandName = details.brandName || product.brandName;
        
        await ctx.runMutation(internal.cafoliScraperDb.upsertWebProduct, {
          brandName: finalBrandName,
          composition: finalComposition,
          dosageForm: finalDosageForm,
          pageUrl: product.pageUrl,
          imageUrl: details.imageUrl || undefined,
          imageUrls: details.imageUrls.length > 0 ? details.imageUrls : undefined,
          pdfUrl: details.pdfUrl || undefined,
          literaturePdfUrl: details.literaturePdfUrl || undefined,
          mrp: details.mrp || undefined,
          packaging: details.packaging || undefined,
          packagingType: details.packagingType || undefined,
          description: details.description || undefined,
        });
        
        scraped++;
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`[SCRAPER] Failed to scrape ${product.pageUrl}:`, err);
        try {
          await ctx.runMutation(internal.cafoliScraperDb.upsertWebProduct, {
            brandName: product.brandName,
            composition: product.composition,
            dosageForm: product.dosageForm,
            pageUrl: product.pageUrl,
            imageUrl: product.imageUrl || undefined,
          });
          scraped++;
        } catch (e) {
          failed++;
        }
      }
    }
    
    return { scraped, failed };
  },
});

// Main scraper action: fetch all products from allproduct.aspx and scrape details
export const scrapeAllCafoliProducts = action({
  args: {
    batchSize: v.optional(v.number()),
    startOffset: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ total: number; scraped: number; failed: number; hasMore: boolean; nextOffset: number }> => {
    const batchSize = args.batchSize || 50;
    const startOffset = args.startOffset || 0;
    
    console.log(`[SCRAPER] Fetching product list from cafoli.in/allproduct.aspx`);
    
    const res = await fetch("https://cafoli.in/allproduct.aspx", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
      signal: AbortSignal.timeout(30000),
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch product list: ${res.status}`);
    }
    
    const html = await res.text();
    const allProducts = parseProductListHtml(html);
    
    console.log(`[SCRAPER] Found ${allProducts.length} products in list`);
    
    const batch = allProducts.slice(startOffset, startOffset + batchSize);
    const hasMore = startOffset + batchSize < allProducts.length;
    const nextOffset = startOffset + batchSize;
    
    if (batch.length === 0) {
      return { total: allProducts.length, scraped: 0, failed: 0, hasMore: false, nextOffset };
    }
    
    const result = await ctx.runAction(internal.cafoliScraper.scrapeProductDetailsBatch, {
      products: batch.map(p => ({
        brandName: p.brandName,
        composition: p.composition || undefined,
        dosageForm: p.dosageForm || undefined,
        pageUrl: p.pageUrl,
        imageUrl: p.imageUrl || undefined,
      })),
    });
    
    console.log(`[SCRAPER] Batch complete: ${result.scraped} scraped, ${result.failed} failed`);
    
    return {
      total: allProducts.length,
      scraped: result.scraped,
      failed: result.failed,
      hasMore,
      nextOffset,
    };
  },
});

export const getWebProductStats = action({
  args: {},
  handler: async (ctx): Promise<{ count: number }> => {
    const count = await ctx.runQuery(internal.cafoliScraperDb.getWebProductCount);
    return { count };
  },
});

// Fix corrupted compositions by re-fetching from product pages
export const fixCorruptedCompositions = action({
  args: {
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ fixed: number; skipped: number; failed: number; hasMore: boolean; nextOffset: number }> => {
    const offset = args.offset || 0;
    const batchSize = 20;

    const allProducts: any[] = await ctx.runQuery(internal.cafoliScraperDb.listWebProducts);
    
    const corruptedProducts = allProducts.filter((p: any) => {
      if (!p.composition) return false;
      const c = p.composition.toLowerCase();
      return (
        c.includes("guide-in-pcd-franchise") ||
        c.includes("'>") ||
        c.includes("</a>") ||
        c.includes("dropdown-item") ||
        c.includes("guide") ||
        c.includes("franchise") ||
        c.includes("pcd pharma") ||
        c.includes("business") ||
        c.includes("company") ||
        p.composition.length > 300
      );
    });

    const batch = corruptedProducts.slice(offset, offset + batchSize);
    const hasMore = offset + batchSize < corruptedProducts.length;
    const nextOffset = offset + batchSize;

    let fixed = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of batch) {
      try {
        const res = await fetch(product.pageUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
          signal: AbortSignal.timeout(12000),
        });

        if (!res.ok) {
          await ctx.runMutation(internal.cafoliScraperDb.patchWebProduct, {
            id: product._id,
            composition: undefined,
          });
          skipped++;
          continue;
        }

        const html = await res.text();
        const details = extractProductPageDetails(html);

        await ctx.runMutation(internal.cafoliScraperDb.patchWebProduct, {
          id: product._id,
          composition: details.composition || undefined,
        });

        fixed++;
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        console.error(`[FIX_COMP] Failed for ${product.pageUrl}:`, err);
        try {
          await ctx.runMutation(internal.cafoliScraperDb.patchWebProduct, {
            id: product._id,
            composition: undefined,
          });
        } catch {}
        failed++;
      }
    }

    console.log(`[FIX_COMP] Batch done: ${fixed} fixed, ${skipped} skipped, ${failed} failed. Total corrupted: ${corruptedProducts.length}, hasMore: ${hasMore}`);

    return { fixed, skipped, failed, hasMore, nextOffset };
  },
});

// Re-scrape all existing products to update their data (fixes stale/corrupted data)
// Processes in batches to avoid timeouts
export const fullRescrapeAllProducts = action({
  args: {
    offset: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ updated: number; failed: number; hasMore: boolean; nextOffset: number; total: number }> => {
    const offset = args.offset || 0;
    const batchSize = args.batchSize || 30;

    const allProducts: any[] = await ctx.runQuery(internal.cafoliScraperDb.listWebProducts);
    const batch = allProducts.slice(offset, offset + batchSize);
    const hasMore = offset + batchSize < allProducts.length;
    const nextOffset = offset + batchSize;

    let updated = 0;
    let failed = 0;

    for (const product of batch) {
      try {
        const res = await fetch(product.pageUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; CafoliBot/1.0)" },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          failed++;
          continue;
        }

        const html = await res.text();
        const details = extractProductPageDetails(html);

        await ctx.runMutation(internal.cafoliScraperDb.upsertWebProduct, {
          brandName: details.brandName || product.brandName,
          composition: details.composition || undefined,
          dosageForm: details.dosageForm || product.dosageForm || undefined,
          pageUrl: product.pageUrl,
          imageUrl: details.imageUrl || undefined,
          imageUrls: details.imageUrls.length > 0 ? details.imageUrls : undefined,
          pdfUrl: details.pdfUrl || undefined,
          literaturePdfUrl: details.literaturePdfUrl || undefined,
          mrp: details.mrp || undefined,
          packaging: details.packaging || undefined,
          packagingType: details.packagingType || undefined,
          description: details.description || undefined,
        });

        updated++;
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`[FULL_RESCRAPE] Failed for ${product.pageUrl}:`, err);
        failed++;
      }
    }

    console.log(`[FULL_RESCRAPE] Batch done: ${updated} updated, ${failed} failed. Total: ${allProducts.length}, hasMore: ${hasMore}`);

    return { updated, failed, hasMore, nextOffset, total: allProducts.length };
  },
});