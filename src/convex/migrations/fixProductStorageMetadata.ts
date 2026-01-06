import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

// Query to find products with potentially problematic storage
export const findProblematicProducts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const problematic = [];

    for (const product of products) {
      const issues = [];
      
      // Check each storage field
      if (product.mainImage) {
        const metadata = await ctx.db.system.get(product.mainImage);
        if (!metadata || !metadata.contentType || metadata.contentType === "application/octet-stream") {
          issues.push("mainImage");
        }
      }
      
      if (product.flyer) {
        const metadata = await ctx.db.system.get(product.flyer);
        if (!metadata || !metadata.contentType || metadata.contentType === "application/octet-stream") {
          issues.push("flyer");
        }
      }
      
      if (product.bridgeCard) {
        const metadata = await ctx.db.system.get(product.bridgeCard);
        if (!metadata || !metadata.contentType || metadata.contentType === "application/octet-stream") {
          issues.push("bridgeCard");
        }
      }
      
      if (product.visuelet) {
        const metadata = await ctx.db.system.get(product.visuelet);
        if (!metadata || !metadata.contentType || metadata.contentType === "application/octet-stream") {
          issues.push("visuelet");
        }
      }

      if (issues.length > 0) {
        problematic.push({
          _id: product._id,
          name: product.name,
          issues,
        });
      }
    }

    return problematic;
  },
});

// Mutation to mark products for re-upload (adds a flag)
export const markProductForReupload = internalMutation({
  args: {
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    // Since we can't fix storage metadata directly, we'll need to delete and re-upload
    // For now, just log the product that needs attention
    const product = await ctx.db.get(args.productId);
    if (product) {
      console.log(`Product "${product.name}" (${args.productId}) needs file re-upload`);
    }
  },
});
