import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getAllTags = query({
  handler: async (ctx) => {
    return await ctx.db.query("tags").collect();
  },
});

export const createTag = mutation({
  args: {
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    // Trim and validate inputs
    const trimmedName = args.name.trim();
    const trimmedColor = args.color.trim();

    if (!trimmedName) {
      throw new Error("Tag name cannot be empty");
    }

    if (!trimmedColor) {
      throw new Error("Tag color cannot be empty");
    }

    // Check uniqueness (case-insensitive for name)
    const existingName = await ctx.db
      .query("tags")
      .withIndex("by_name", (q) => q.eq("name", trimmedName))
      .first();
    if (existingName) {
      throw new Error("A tag with this name already exists");
    }

    const existingColor = await ctx.db
      .query("tags")
      .withIndex("by_color", (q) => q.eq("color", trimmedColor))
      .first();
    if (existingColor) {
      throw new Error("A tag with this color already exists");
    }

    return await ctx.db.insert("tags", { name: trimmedName, color: trimmedColor });
  },
});

export const updateTag = mutation({
  args: {
    id: v.id("tags"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingTag = await ctx.db.get(args.id);
    if (!existingTag) {
      throw new Error("Tag not found");
    }

    const updates: { name?: string; color?: string } = {};

    // Validate and check uniqueness for name if provided
    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (!trimmedName) {
        throw new Error("Tag name cannot be empty");
      }

      // Check if another tag has this name
      const nameConflict = await ctx.db
        .query("tags")
        .withIndex("by_name", (q) => q.eq("name", trimmedName))
        .first();
      
      if (nameConflict && nameConflict._id !== args.id) {
        throw new Error("A tag with this name already exists");
      }

      updates.name = trimmedName;
    }

    // Validate and check uniqueness for color if provided
    if (args.color !== undefined) {
      const trimmedColor = args.color.trim();
      if (!trimmedColor) {
        throw new Error("Tag color cannot be empty");
      }

      // Check if another tag has this color
      const colorConflict = await ctx.db
        .query("tags")
        .withIndex("by_color", (q) => q.eq("color", trimmedColor))
        .first();
      
      if (colorConflict && colorConflict._id !== args.id) {
        throw new Error("A tag with this color already exists");
      }

      updates.color = trimmedColor;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }

    return args.id;
  },
});

export const deleteTag = mutation({
  args: {
    id: v.id("tags"),
  },
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.id);
    if (!tag) {
      throw new Error("Tag not found");
    }

    // Remove this tag from all leads that have it
    const leadsWithTag = await ctx.db.query("leads").collect();
    for (const lead of leadsWithTag) {
      if (lead.tags && lead.tags.includes(args.id)) {
        const updatedTags = lead.tags.filter(t => t !== args.id);
        await ctx.db.patch(lead._id, { tags: updatedTags });
      }
    }

    await ctx.db.delete(args.id);
  },
});

export const getTagsByIds = query({
  args: { ids: v.array(v.id("tags")) },
  handler: async (ctx, args) => {
    const tags = [];
    for (const id of args.ids) {
      const tag = await ctx.db.get(id);
      if (tag) tags.push(tag);
    }
    return tags;
  },
});