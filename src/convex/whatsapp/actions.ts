import { v } from "convex/values";
import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";

export const handleIncomingMessage = action({
  args: { 
    phoneNumber: v.string(), 
    message: v.string(),
    messageId: v.string() 
  },
  handler: async (ctx, args) => {
    // 1. Check if it's a reply to a bulk campaign
    await ctx.runMutation(api.bulkMessaging.processReply, {
      phoneNumber: args.phoneNumber,
      message: args.message
    });

    // 2. Standard message handling logic...
  }
});