import { internalMutation, internalQuery } from "./_generated/server";
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
    return await ctx.db.query("cafoliWebProducts").take(2000);
  },
});
