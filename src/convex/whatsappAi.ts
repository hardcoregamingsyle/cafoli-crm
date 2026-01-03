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
    // 1. Fetch all products for context
    const products = await ctx.runQuery(api.products.listProducts);
    const productNames = products.map(p => p.name).join(", ");

    // 2. Generate content using the AI service
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
    let messageToSend = aiResponse;
    let mediaToSend = null;
    let productNotFound = false;
    let requestedProductName = "";

    try {
        // Only try to parse as JSON if it looks like JSON
        const trimmedResponse = aiResponse.trim();
        if (trimmedResponse.startsWith("{") && trimmedResponse.endsWith("}")) {
            const parsed = JSON.parse(trimmedResponse);
            if (parsed.productName) {
                const product = products.find(p => p.name.toLowerCase() === parsed.productName.toLowerCase());
                if (product) {
                    // Product found - send full details
                    messageToSend = `Here are the details for *${product.name}*:\n\n` +
                                  `🏷️ Brand: ${product.brandName}\n` +
                                  `🧪 Molecule: ${product.molecule || "N/A"}\n` +
                                  `💰 MRP: ₹${product.mrp}\n` +
                                  `📦 Packaging: ${product.packaging || "N/A"}\n\n` +
                                  `${product.description || ""}`;
                    
                    if (product.images && product.images.length > 0) {
                        mediaToSend = {
                            storageId: product.images[0],
                            fileName: `${product.name}.jpg`,
                            mimeType: "image/jpeg"
                        };
                    }
                } else {
                    // Product not found in database - trigger intervention
                    productNotFound = true;
                    requestedProductName = parsed.productName;
                    messageToSend = "This product image and details will be shared shortly. 📦";
                }
            } else if (parsed.message) {
                // AI returned a JSON with just a message field
                messageToSend = parsed.message;
            }
        }
        // If not JSON format, use the response as-is (normal conversation)
    } catch (e) {
        // Not valid JSON, treat as plain text response (normal conversation)
        // This is expected for general chat messages
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

    // 5. If product not found, create intervention request
    if (productNotFound && requestedProductName) {
        const lead = await ctx.runQuery(api.leads.queries.getLead, { id: args.leadId });
        if (lead && lead.assignedTo) {
            await ctx.runMutation(api.interventionRequests.createInterventionRequest, {
                leadId: args.leadId,
                assignedTo: lead.assignedTo,
                requestedProduct: requestedProductName,
                customerMessage: args.prompt || "",
            });
        }
    }

    return messageToSend;
  },
});