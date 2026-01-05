"use node";

// This file is deprecated. Please use the new files in src/convex/whatsapp/
// We are keeping this file empty or with re-exports if needed, but for now we are moving logic to subfiles.
// The actions are now at:
// api.whatsapp.messages.send
// api.whatsapp.messages.sendMedia
// api.whatsapp.webhook.handleIncomingMessage
// etc.

import { action } from "./_generated/server";
import { v } from "convex/values";

// Deprecated stub to prevent immediate breakage if called directly (though API path changes anyway)
export const sendWhatsAppMessage = action({
  args: {
    phoneNumber: v.string(),
    message: v.string(),
    leadId: v.id("leads"),
    quotedMessageId: v.optional(v.id("messages")),
    quotedMessageExternalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    throw new Error("This action is deprecated. Use api.whatsapp.messages.send instead.");
  },
});