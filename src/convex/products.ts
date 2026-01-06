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
    visualaid: v.optional(v.id("_storage")),
    
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
      visualaid: args.visualaid,
      description: args.description,
      pageLink: args.pageLink,
    });
    return productId;
  },
});

export const updateProduct = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    brandName: v.string(),
    molecule: v.optional(v.string()),
    mrp: v.string(),
    packaging: v.string(),
    mainImage: v.optional(v.id("_storage")),
    flyer: v.optional(v.id("_storage")),
    bridgeCard: v.optional(v.id("_storage")),
    visualaid: v.optional(v.id("_storage")),
    description: v.optional(v.string()),
    pageLink: v.optional(v.string()),
    
    // Flags to remove optional files
    removeFlyer: v.optional(v.boolean()),
    removeBridgeCard: v.optional(v.boolean()),
    removeVisualaid: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) throw new Error("Product not found");

    const updates: any = {
      name: args.name || args.brandName,
      brandName: args.brandName,
      molecule: args.molecule,
      mrp: args.mrp,
      packaging: args.packaging,
      description: args.description,
      pageLink: args.pageLink,
    };

    // Handle file updates
    if (args.mainImage) {
      // Delete old main image if it exists and is different
      if (product.mainImage && product.mainImage !== args.mainImage) {
        // We don't delete immediately in case of race conditions or if it's used elsewhere, 
        // but for this app we can probably delete it or let a cron job clean up.
        // For now, let's just update the reference.
        // Ideally: await ctx.storage.delete(product.mainImage);
      }
      updates.mainImage = args.mainImage;
      updates.images = [args.mainImage]; // Keep backward compatibility
    }

    if (args.flyer) updates.flyer = args.flyer;
    if (args.bridgeCard) updates.bridgeCard = args.bridgeCard;
    if (args.visualaid) updates.visualaid = args.visualaid;

    // Handle removals
    if (args.removeFlyer && product.flyer) {
      // await ctx.storage.delete(product.flyer);
      updates.flyer = undefined;
    }
    if (args.removeBridgeCard && product.bridgeCard) {
      // await ctx.storage.delete(product.bridgeCard);
      updates.bridgeCard = undefined;
    }
    if (args.removeVisualaid && product.visualaid) {
      // await ctx.storage.delete(product.visualaid);
      updates.visualaid = undefined;
    }

    await ctx.db.patch(args.id, updates);
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
    const products = await ctx.db.query("products").collect();
    return products.map(p => ({
      _id: p._id,
      name: p.name,
      brandName: p.brandName,
      molecule: p.molecule,
      mrp: p.mrp,
      packaging: p.packaging,
      description: p.description,
      pageLink: p.pageLink,
      mainImage: p.mainImage,
      flyer: p.flyer,
      bridgeCard: p.bridgeCard,
      visualaid: p.visualaid,
    }));
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

export const getProductById = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getProductWithUrls = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) return null;

    const urls: any = {};
    
    if (product.mainImage) {
      urls.mainImageUrl = await ctx.storage.getUrl(product.mainImage);
    }
    if (product.flyer) {
      urls.flyerUrl = await ctx.storage.getUrl(product.flyer);
    }
    if (product.bridgeCard) {
      urls.bridgeCardUrl = await ctx.storage.getUrl(product.bridgeCard);
    }
    if (product.visualaid) {
      urls.visualaidUrl = await ctx.storage.getUrl(product.visualaid);
    }

    return { ...product, ...urls };
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
    if (product.visualaid) storageIds.add(product.visualaid);

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