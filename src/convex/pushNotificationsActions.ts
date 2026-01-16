"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import * as webpush from "web-push";
import { internal } from "./_generated/api";

// In a real app, these should be environment variables
const VAPID_PUBLIC_KEY = "BD6Q8d5SFwDWj3Jd1cWzMtelFYsYXnOmYo_WhEttPPk6evm4jrbMwp_Y-iiSYNnVqIhFcIJ1ExECH_OQjV7i7Uk";
const VAPID_PRIVATE_KEY = "c68s2WlVhARopXUxFS25osq5TFZYYMsy2s8NCfB_WkI";
const VAPID_SUBJECT = "mailto:support@cafoli.com";

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export const sendPushNotification = action({
  args: {
    userId: v.id("users"),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const subscriptions: any[] = await ctx.runQuery(internal.pushNotifications.getSubscriptions, {
      userId: args.userId,
    });

    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      url: args.url,
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload
          );
          return { status: "fulfilled", id: sub._id };
        } catch (error: any) {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription has expired or is no longer valid
            await ctx.runMutation(internal.pushNotifications.deleteSubscription, {
              id: sub._id,
            });
          }
          throw error;
        }
      })
    );
    
    return results;
  },
});