import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Internal mutation to upsert a scraped product
export const upsertWebProduct = internalMutation({
  args: {
    brandName: v.string(),
    composition: v.optional(v.string()),
    dosageForm: v.optional(v.string()),
    pageUrl: v.string(),
    imageUrl: v.optional(v.string()),
    pdfUrl: v.optional(v.string()),
    literaturePdfUrl: v.optional(v.string()),
    mrp: v.optional(v.string()),
    packaging: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cafoliWebProducts")
      .withIndex("by_pageUrl", q => q.eq("pageUrl", args.pageUrl))
      .first();

    const data = {
      brandName: args.brandName,
      composition: args.composition,
      dosageForm: args.dosageForm,
      pageUrl: args.pageUrl,
      imageUrl: args.imageUrl,
      pdfUrl: args.pdfUrl,
      literaturePdfUrl: args.literaturePdfUrl,
      mrp: args.mrp,
      packaging: args.packaging,
      description: args.description,
      scrapedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("cafoliWebProducts", data);
    }
  },
});

export const getWebProductCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("cafoliWebProducts").take(10000);
    return products.length;
  },
});

export const listWebProducts = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("cafoliWebProducts").take(5000);
  },
});

// Public query for reactive count display
export const getWebProductCountPublic = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("cafoliWebProducts").take(10000);
    return products.length;
  },
});

// Clean up corrupted composition data (entries containing HTML artifacts)
export const cleanupCorruptedCompositions = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("cafoliWebProducts").take(5000);
    let cleaned = 0;
    
    for (const product of products) {
      if (product.composition && (
        product.composition.includes("guide-in-pcd-franchise") ||
        product.composition.includes("'>") ||
        product.composition.includes("</a>") ||
        product.composition.includes("dropdown-item") ||
        product.composition.length > 500
      )) {
        await ctx.db.patch(product._id, { composition: undefined });
        cleaned++;
      }
    }
    
    return { cleaned };
  },
});

// Delete a batch of cached web products - returns hasMore for looping
export const deleteAllWebProducts = mutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("cafoliWebProducts").take(100);
    await Promise.all(products.map(p => ctx.db.delete(p._id)));
    const remaining = await ctx.db.query("cafoliWebProducts").take(1);
    return { deleted: products.length, hasMore: remaining.length > 0 };
  },
});