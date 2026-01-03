import { internalMutation } from "../_generated/server";

export const migrateProductsRateToPackaging = internalMutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    
    let migratedCount = 0;
    for (const product of products) {
      // @ts-ignore - accessing old field
      if (product.rate !== undefined) {
        await ctx.db.patch(product._id, {
          // @ts-ignore - removing old field
          rate: undefined,
          // @ts-ignore - setting new field from old value
          packaging: product.rate,
        });
        migratedCount++;
      }
    }
    
    console.log(`Migrated ${migratedCount} products from 'rate' to 'packaging'`);
    return { migratedCount };
  },
});
