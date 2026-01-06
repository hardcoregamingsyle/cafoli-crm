import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Configuration for WhatsApp automated responses
 */

// Changed to internalQuery so it can be called from webhook without api type issues
export const getContactRequestMessage = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("whatsappConfig")
      .filter((q) => q.eq(q.field("key"), "contactRequestMessage"))
      .first();
    
    return config?.value || "Thank you for your request! A member of our team will contact you shortly. 🙏";
  },
});

export const setContactRequestMessage = mutation({
  args: {
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("whatsappConfig")
      .filter((q) => q.eq(q.field("key"), "contactRequestMessage"))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.message });
    } else {
      await ctx.db.insert("whatsappConfig", {
        key: "contactRequestMessage",
        value: args.message,
      });
    }
  },
});