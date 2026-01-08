import { internalMutation, internalQuery, action } from "../_generated/server";
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
export const runMigration = action({
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

    const productsWithDetails = problematic.map(p => ({
      ...p,
      details: `Files with issues: ${p.issues.join(", ")}. These files will download as .htm because they lack proper Content-Type metadata.`
    }));

    return {
      success: false,
      message: `⚠️ Found ${problematic.length} product(s) with incorrect file metadata.\n\n` +
               `These files were uploaded without proper Content-Type headers and will download as .htm files.\n\n` +
               `ACTION REQUIRED: For each product listed below, click the Edit button (✏️) and re-upload the affected files.\n\n` +
               `The upload dialog now correctly sets Content-Type headers, so re-uploaded files will work properly.\n\n` +
               `Note: The "Fix Now" button cannot automatically fix these files because Convex storage doesn't preserve the original file type information.`,
      count: problematic.length,
      products: productsWithDetails,
    };
  },
});

// Helper to detect MIME type from magic bytes
function detectMimeTypeFromBytes(bytes: Uint8Array): string | null {
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return "image/jpeg";
  }
  // PDF: 25 50 44 46
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

// Helper mutation to generate upload URL
export const generateUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Helper mutation to get storage URL
export const getStorageUrl = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// Action to fix files with incorrect metadata
export const fixFiles = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    message: string;
    fixed: number;
    failed: Array<{ productName: string; field: string; error: string }>;
  }> => {
    console.log("🔧 Starting fixFiles action...");
    
    const problematic: Array<{ _id: any; name: string; issues: string[] }> = await ctx.runQuery(internal.migrations.fixProductStorageMetadata.findProblematicProducts);
    
    console.log(`📊 Found ${problematic.length} products with issues:`, problematic);
    
    if (problematic.length === 0) {
      return {
        success: true,
        message: "No files need fixing!",
        fixed: 0,
        failed: [],
      };
    }

    let fixedCount = 0;
    const failures: Array<{ productName: string; field: string; error: string }> = [];

    for (const product of problematic) {
      console.log(`\n🔍 Processing product: ${product.name}`);
      
      for (const field of product.issues) {
        console.log(`  📁 Fixing field: ${field}`);
        
        try {
          // Get the product to access the storage ID
          const productData = await ctx.runQuery(internal.migrations.fixProductStorageMetadata.getProductForFix, { 
            productId: product._id 
          });
          
          if (!productData) {
            const error = "Product not found";
            console.error(`  ❌ ${error}`);
            failures.push({ productName: product.name, field, error });
            continue;
          }

          const storageId = (productData as any)[field];
          if (!storageId) {
            const error = "Storage ID not found";
            console.error(`  ❌ ${error}`);
            failures.push({ productName: product.name, field, error });
            continue;
          }

          console.log(`  📦 Storage ID: ${storageId}`);

          // Get the file URL using mutation
          const url = await ctx.runMutation(internal.migrations.fixProductStorageMetadata.getStorageUrl, { storageId });
          if (!url) {
            const error = "Could not get file URL";
            console.error(`  ❌ ${error}`);
            failures.push({ productName: product.name, field, error });
            continue;
          }

          console.log(`  🌐 File URL obtained`);

          // Fetch the file content
          const response = await fetch(url);
          if (!response.ok) {
            const error = `Failed to fetch file: ${response.statusText}`;
            console.error(`  ❌ ${error}`);
            failures.push({ productName: product.name, field, error });
            continue;
          }

          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          console.log(`  📥 Downloaded ${bytes.length} bytes`);

          // Detect correct MIME type
          const correctMimeType = detectMimeTypeFromBytes(bytes);
          if (!correctMimeType) {
            const error = `Could not detect file type (first bytes: ${Array.from(bytes.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join(' ')})`;
            console.error(`  ❌ ${error}`);
            failures.push({ productName: product.name, field, error });
            continue;
          }

          console.log(`  🎯 Detected MIME type: ${correctMimeType}`);

          // Create a blob with the correct MIME type
          const blob = new Blob([bytes], { type: correctMimeType });

          // Upload the file with correct metadata using mutation
          const uploadUrl = await ctx.runMutation(internal.migrations.fixProductStorageMetadata.generateUploadUrl);
          const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": correctMimeType },
            body: blob,
          });

          if (!uploadResponse.ok) {
            const error = `Failed to upload corrected file: ${uploadResponse.statusText}`;
            console.error(`  ❌ ${error}`);
            failures.push({ productName: product.name, field, error });
            continue;
          }

          const { storageId: newStorageId } = await uploadResponse.json();
          console.log(`  📤 Uploaded with new storage ID: ${newStorageId}`);

          // Update the product with the new storage ID
          await ctx.runMutation(internal.migrations.fixProductStorageMetadata.updateProductFile, {
            productId: product._id,
            field,
            newStorageId,
            oldStorageId: storageId,
          });

          console.log(`  ✅ Successfully fixed ${field} for ${product.name}`);
          fixedCount++;
        } catch (error: any) {
          const errorMsg = error.message || String(error);
          console.error(`  ❌ Error fixing ${field}:`, errorMsg);
          console.error(`  Stack:`, error.stack);
          failures.push({ 
            productName: product.name, 
            field, 
            error: errorMsg
          });
        }
      }
    }

    console.log(`\n📈 Fix complete: ${fixedCount} fixed, ${failures.length} failed`);
    
    return {
      success: failures.length === 0,
      message: `Fixed ${fixedCount} file(s). ${failures.length > 0 ? `${failures.length} failed.` : ""}`,
      fixed: fixedCount,
      failed: failures,
    };
  },
});

// Helper query to get product data for fixing
export const getProductForFix = internalQuery({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.productId);
  },
});

// Helper mutation to update product file reference
export const updateProductFile = internalMutation({
  args: {
    productId: v.id("products"),
    field: v.string(),
    newStorageId: v.id("_storage"),
    oldStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const updates: any = {};
    updates[args.field] = args.newStorageId;
    
    // Also update the images array if it's the mainImage
    if (args.field === "mainImage") {
      updates.images = [args.newStorageId];
    }
    
    await ctx.db.patch(args.productId, updates);
    
    // Delete the old file
    try {
      await ctx.storage.delete(args.oldStorageId);
    } catch (e) {
      // Ignore if already deleted
      console.log("Could not delete old file:", e);
    }
  },
});