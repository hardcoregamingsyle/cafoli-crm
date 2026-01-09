import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";

export const storeGroup = internalMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    groupId: v.optional(v.string()),
    inviteLink: v.optional(v.string()),
    participantPhoneNumbers: v.array(v.string()),
    createdBy: v.id("users"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("whatsappGroups", {
      name: args.name,
      description: args.description,
      groupId: args.groupId,
      inviteLink: args.inviteLink,
      participantPhoneNumbers: args.participantPhoneNumbers,
      createdBy: args.createdBy,
      status: args.status,
    });
  },
});

export const updateGroupStatus = mutation({
  args: {
    groupId: v.id("whatsappGroups"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.groupId, {
      status: args.status,
    });
  },
});
