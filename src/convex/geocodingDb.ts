import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

export const queryLeadsNeedingGeocode = internalQuery({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").take(50);
    return leads.filter(
      (l: any) => !l.lat && !l.lng && (l.city || l.state || l.country)
    );
  },
});

export const updateLeadCoordinates = internalMutation({
  args: {
    id: v.id("leads"),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lat: args.lat, lng: args.lng } as any);
  },
});