"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

export const generateAndSendAiReply = action({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
    userId: v.optional(v.id("users")),
    replyingToMessageId: v.optional(v.id("messages")),
    replyingToExternalId: v.optional(v.string()),
    context: v.any(),
    prompt: v.optional(v.string()),
    isAutoReply: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<string> => {
    // 1. Fetch all products for context if needed
    // We'll pass this to the AI generation action
    const products = await ctx.runQuery(api.products.listProducts);
    const productNames = products.map(p => p.name).join(", ");

    // 2. Generate content using the AI service
    // Get system user if no userId provided
    const systemUser = args.userId ? null : await ctx.runQuery(api.users.getSystemUser);
    const userId = args.userId || systemUser?._id;
    
    if (!userId) {
      throw new Error("No user ID available for AI generation");
    }

    const aiResponse = (await ctx.runAction(api.ai.generateContent, {
      prompt: args.prompt || "Draft a reply to this conversation",
      type: "chat_reply",
      context: {
        ...args.context,
        availableProducts: productNames,
        isAutoReply: args.isAutoReply
      },
      userId: userId,
      leadId: args.leadId,
    })) as string;

    if (!aiResponse) {
      throw new Error("AI failed to generate a response");
    }

    // 3. Check if the response indicates a product match (JSON format)
    // We'll try to parse it as JSON if it looks like it
    let messageToSend = aiResponse;
    let mediaToSend = null;

    try {
        // Simple check if response is JSON
        if (aiResponse.trim().startsWith("{") && aiResponse.trim().endsWith("}")) {
            const parsed = JSON.parse(aiResponse);
            if (parsed.productName) {
                // Find the product
                const product = products.find(p => p.name.toLowerCase() === parsed.productName.toLowerCase());
                if (product) {
                    messageToSend = `Here are the details for ${product.name}:\nBrand: ${product.brandName}\nMolecule: ${product.molecule || "N/A"}\nMRP: ${product.mrp}\nRate: ${product.rate}\n${product.description || ""}`;
                    
                    if (product.images && product.images.length > 0) {
                        mediaToSend = {
                            storageId: product.images[0],
                            fileName: `${product.name}.jpg`, // Assumption
                            mimeType: "image/jpeg" // Assumption
                        };
                    }
                } else {
                    messageToSend = parsed.message || aiResponse;
                }
            } else if (parsed.message) {
                messageToSend = parsed.message;
            }
        }
    } catch (e) {
        // Not JSON, treat as plain text
    }

    // 4. Send message immediately via WhatsApp
    if (mediaToSend) {
        await ctx.runAction(api.whatsapp.sendWhatsAppMedia, {
            phoneNumber: args.phoneNumber,
            message: messageToSend,
            leadId: args.leadId,
            storageId: mediaToSend.storageId,
            fileName: mediaToSend.fileName,
            mimeType: mediaToSend.mimeType,
        });
    } else {
        await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
            phoneNumber: args.phoneNumber,
            message: messageToSend,
            leadId: args.leadId,
            quotedMessageId: args.replyingToMessageId,
            quotedMessageExternalId: args.replyingToExternalId,
        });
    }

    return messageToSend;
  },
});