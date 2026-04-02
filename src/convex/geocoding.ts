"use node";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: { "User-Agent": "CafoliConnect/1.0 (hardcorgamingstyle@gmail.com)" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

export const geocodeLead = action({
  args: {
    leadId: v.id("leads"),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parts = [args.city, args.state, args.country].filter(Boolean);
    if (parts.length === 0) return null;

    const query = parts.join(", ");
    const coords = await nominatimGeocode(query);
    if (!coords) return null;

    await ctx.runMutation(internal.geocodingDb.updateLeadCoordinates, {
      id: args.leadId,
      lat: coords.lat,
      lng: coords.lng,
    });

    return coords;
  },
});

export const batchGeocodeLeads = internalAction({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.runQuery(internal.geocodingDb.queryLeadsNeedingGeocode, {});
    let geocoded = 0;

    for (const lead of leads) {
      const l = lead as any;
      const parts = [l.city, l.state, l.country].filter(Boolean);
      if (parts.length === 0) continue;

      const query = parts.join(", ");
      const coords = await nominatimGeocode(query);
      if (coords) {
        await ctx.runMutation(internal.geocodingDb.updateLeadCoordinates, {
          id: lead._id,
          lat: coords.lat,
          lng: coords.lng,
        });
        geocoded++;
        await new Promise((r) => setTimeout(r, 1100));
      }
    }

    return { geocoded };
  },
});