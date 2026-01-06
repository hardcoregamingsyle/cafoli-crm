import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const createProduct = mutation({
  args: {
    name: v.optional(v.string()),
    brandName: v.string(),
    molecule: v.optional(v.string()),
    mrp: v.string(),
    packaging: v.string(),
    // images: v.array(v.id("_storage")), // Deprecated in input
    mainImage: v.id("_storage"),
    flyer: v.optional(v.id("_storage")),
    bridgeCard: v.optional(v.id("_storage")),
    visuelet: v.optional(v.id("_storage")),
    
    description: v.optional(v.string()),
    pageLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const productId = await ctx.db.insert("products", {
      name: args.name || args.brandName,
      brandName: args.brandName,
      molecule: args.molecule,
      mrp: args.mrp,
      packaging: args.packaging,
      images: [args.mainImage], // Backward compatibility
      mainImage: args.mainImage,
      flyer: args.flyer,
      bridgeCard: args.bridgeCard,
      visuelet: args.visuelet,
      description: args.description,
      pageLink: args.pageLink,
    });
    return productId;
  },
});

export const listProducts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("products").order("desc").collect();
  },
});

// Internal version for use in actions
export const listProductsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("products").order("desc").collect();
  },
});

export const getProductByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const deleteProduct = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) {
      throw new Error("Product not found");
    }
    
    // Delete associated images from storage
    if (product.images) {
      for (const imageId of product.images) {
        await ctx.storage.delete(imageId);
      }
    }

    // Delete new fields if they exist and aren't in images array (though mainImage is)
    // To be safe, we can try deleting them, if they are already deleted it might throw or be no-op depending on implementation
    // But since mainImage is in images, we just need to check others.
    // Actually, let's just try to delete all distinct storage IDs.
    
    const storageIds = new Set<string>();
    if (product.images) product.images.forEach(id => storageIds.add(id));
    if (product.mainImage) storageIds.add(product.mainImage);
    if (product.flyer) storageIds.add(product.flyer);
    if (product.bridgeCard) storageIds.add(product.bridgeCard);
    if (product.visuelet) storageIds.add(product.visuelet);

    for (const storageId of storageIds) {
      try {
        await ctx.storage.delete(storageId as any);
      } catch (e) {
        // Ignore if already deleted
      }
    }
    
    await ctx.db.delete(args.id);
  },
});

export const getStorageMetadata = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.db.system.get(args.storageId);
  },
});