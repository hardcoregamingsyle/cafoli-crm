"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const createGroup = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    participantPhoneNumbers: v.array(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    groupId?: string;
    whatsappGroupId?: string;
    inviteLink?: string;
    error?: string;
  }> => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured");
    }

    try {
      // Create group via WhatsApp Cloud API
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/groups`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: args.name,
            description: args.description || "",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("WhatsApp group creation error:", data);
        
        // Store failed group attempt
        const groupId: string = await ctx.runMutation(internal.whatsappGroupsMutations.storeGroup, {
          name: args.name,
          description: args.description,
          participantPhoneNumbers: args.participantPhoneNumbers,
          createdBy: args.userId,
          status: "failed",
        });

        return {
          success: false,
          error: data.error?.message || "Failed to create group",
          groupId,
        };
      }

      const whatsappGroupId = data.id;

      // Get invite link
      const inviteLinkResponse = await fetch(
        `https://graph.facebook.com/v20.0/${whatsappGroupId}/invite_link`,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
          },
        }
      );

      const inviteLinkData = await inviteLinkResponse.json();
      const inviteLink = inviteLinkData.invite_link || "";

      // Store group in database
      const groupId: string = await ctx.runMutation(internal.whatsappGroupsMutations.storeGroup, {
        name: args.name,
        description: args.description,
        groupId: whatsappGroupId,
        inviteLink,
        participantPhoneNumbers: args.participantPhoneNumbers,
        createdBy: args.userId,
        status: "created",
      });

      // Log activity
      await ctx.runMutation(internal.activityLogs.logActivity, {
        category: "WhatsApp: Group",
        action: "Created WhatsApp Group",
        details: `Group: ${args.name}`,
        metadata: { groupId: whatsappGroupId, inviteLink },
      });

      return {
        success: true,
        groupId,
        whatsappGroupId,
        inviteLink,
      };
    } catch (error) {
      console.error("Error creating WhatsApp group:", error);
      throw new Error(`Failed to create group: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});
