import { internalMutation, internalQuery, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

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
      
      if (product.visualaid) {
        const metadata = await ctx.db.system.get(product.visualaid);
        if (!metadata || !metadata.contentType || metadata.contentType === "application/octet-stream") {
          issues.push("visualaid");
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

// Add this new query to check individual file metadata
export const checkFileMetadata = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const metadata = await ctx.db.system.get(args.storageId);
    return metadata;
  },
});

// Action to run the full migration check and report
export const runMigration = internalAction({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    message: string;
    count: number;
    products?: Array<{ _id: any; name: string; issues: string[]; details: any }>;
  }> => {
    const problematic: Array<{ _id: any; name: string; issues: string[] }> = await ctx.runQuery(internal.migrations.fixProductStorageMetadata.findProblematicProducts);
    
    if (problematic.length === 0) {
      return {
        success: true,
        message: "✅ All products have correct file metadata!",
        count: 0,
      };
    }

    // Add detailed information about what's wrong
    const productsWithDetails = problematic.map(p => ({
      ...p,
      details: `Files with issues: ${p.issues.join(", ")}. These files will download as .htm because they lack proper Content-Type metadata.`
    }));

    return {
      success: false,
      message: `⚠️ Found ${problematic.length} product(s) with incorrect file metadata.\n\n` +
               `These files were uploaded without proper Content-Type headers and will download as .htm files.\n\n` +
               `Solution: Use the Edit button (✏️) on each product to re-upload the affected files.\n\n` +
               `Affected files will be replaced with properly formatted versions.`,
      count: problematic.length,
      products: productsWithDetails,
    };
  },
});