import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const createProduct = mutation({
  args: {
    name: v.optional(v.string()),
    brandName: v.string(),
    molecule: v.optional(v.string()),
    mrp: v.string(),
    packaging: v.string(),
    images: v.array(v.id("_storage")),
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
      images: args.images,
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
    for (const imageId of product.images) {
      await ctx.storage.delete(imageId);
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