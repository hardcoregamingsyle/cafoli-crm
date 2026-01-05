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
    const systemUser = args.userId ? null : await ctx.runQuery(api.users.getSystemUser);
    const userId = args.userId || systemUser?._id;
    
    if (!userId) {
      throw new Error("No user ID available for AI generation");
    }

    // 1. FIRST: Check if customer wants to speak with salesperson using AI
    let isContactRequest = false;
    let contactConfidence = "low";
    let contactReason = "";
    
    try {
      const detectionResponse = await ctx.runAction(api.ai.generateContent, {
        prompt: args.prompt || "",
        type: "contact_request_detection",
        context: {
          conversationHistory: args.context?.conversationHistory || [],
        },
        userId: userId,
        leadId: args.leadId,
      }) as string;

      console.log("Contact request detection response:", detectionResponse);
      
      const detection = JSON.parse(detectionResponse.trim());
      console.log("Parsed detection:", detection);
      
      contactConfidence = detection.confidence || "low";
      contactReason = detection.reason || "";
      
      // Only trigger contact request if confidence is high or medium
      isContactRequest = detection.wantsContact === true && (contactConfidence === "high" || contactConfidence === "medium");
      console.log("Is contact request:", isContactRequest, "Confidence:", contactConfidence, "Reason:", contactReason);
    } catch (e) {
      console.error("Failed to detect contact request with AI:", e);
    }

    // 2. If contact request detected with sufficient confidence, handle it immediately and return
    if (isContactRequest) {
      const lead = await ctx.runQuery(api.leads.queries.getLead, { id: args.leadId });
      
      if (lead && lead.assignedTo) {
        console.log(`Creating contact request for lead ${args.leadId}, assigned to ${lead.assignedTo}`);
        
        // Create contact request for assigned user
        const requestId = await ctx.runMutation(api.contactRequests.createContactRequest, {
          leadId: args.leadId,
          assignedTo: lead.assignedTo,
          customerMessage: args.prompt || "",
        });

        console.log(`Contact request created with ID: ${requestId}`);

        // Get configurable automated response or use default
        const autoMessage = args.context?.contactRequestMessage || 
          "Thank you for your request! A member of our team will contact you shortly. 🙏";
        
        await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
          phoneNumber: args.phoneNumber,
          message: autoMessage,
          leadId: args.leadId,
          quotedMessageId: args.replyingToMessageId,
          quotedMessageExternalId: args.replyingToExternalId,
        });

        console.log(`Contact request created for lead ${args.leadId} with confidence: ${contactConfidence}`);
        return autoMessage;
      } else {
        console.log(`Lead ${args.leadId} has no assignedTo user, skipping contact request`);
      }
    }

    // 3. If NOT a contact request, proceed with normal AI reply generation
    const products = await ctx.runQuery(api.products.listProducts);
    const productNames = products.map((p: any) => p.name).join(", ");
    
    const rangePdfs = await ctx.runQuery(api.rangePdfs.listRangePdfs);
    const rangeNames = rangePdfs.map((r: any) => {
      if (r.category === "THERAPEUTIC") {
        return `${r.name} (Therapeutic Range)`;
      }
      return `${r.name} (Division: ${r.division})`;
    }).join("; ");

    const aiResponse = (await ctx.runAction(api.ai.generateContent, {
      prompt: args.prompt || "Draft a reply to this conversation",
      type: "chat_reply",
      context: {
        ...args.context,
        availableProducts: productNames,
        availableRanges: rangeNames,
        isAutoReply: args.isAutoReply
      },
      userId: userId,
      leadId: args.leadId,
    })) as string;

    if (!aiResponse) {
      throw new Error("AI failed to generate a response");
    }

    // 4. Check if the response indicates a product match or range match (JSON format)
    let messageToSend = aiResponse;
    let mediasToSend: any[] = [];
    let productNotFound = false;
    let requestedProductName = "";
    let rangePdfsToSend: any[] = [];

    try {
        // Extract JSON from response (handling potential markdown code blocks or preambles)
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : aiResponse.trim();
        
        if (jsonString.startsWith("{") && jsonString.endsWith("}")) {
            const parsed = JSON.parse(jsonString);
            
            // Handle Product Match (Single or Multiple)
            if (parsed.productNames || parsed.productName) {
                const names = parsed.productNames || [parsed.productName];
                const matchedProducts = [];
                const notFoundNames = [];

                for (const name of names) {
                    const product = products.find((p: any) => p.name.toLowerCase() === name.toLowerCase());
                    if (product) {
                        matchedProducts.push(product);
                        console.log(`Found product: ${product.name}, images:`, product.images);
                    } else {
                        notFoundNames.push(name);
                        console.log(`Product not found: ${name}`);
                    }
                }

                if (matchedProducts.length > 0) {
                    messageToSend = matchedProducts.map((product: any) => 
                        `Here are the details for *${product.name}*:\n` +
                        `🏷️ Brand: ${product.brandName}\n` +
                        `🧪 Molecule: ${product.molecule || "N/A"}\n` +
                        `💰 MRP: ₹${product.mrp}\n` +
                        `📦 Packaging: ${product.packaging || "N/A"}\n` +
                        `${product.description || ""}`
                    ).join("\n\n-------------------\n\n");
                    
                    // Collect images for all matched products
                    for (const product of matchedProducts) {
                        if (product.images && product.images.length > 0) {
                            console.log(`Adding image for product ${product.name}: ${product.images[0]}`);
                            mediasToSend.push({
                                storageId: product.images[0],
                                fileName: `${product.name}.jpg`,
                                mimeType: "image/jpeg",
                                caption: `${product.name}`
                            });
                        } else {
                            console.log(`No images found for product: ${product.name}`);
                        }
                    }
                    console.log(`Total images to send: ${mediasToSend.length}`);
                } 
                
                if (notFoundNames.length > 0) {
                    if (matchedProducts.length === 0) {
                        productNotFound = true;
                        requestedProductName = notFoundNames[0];
                        messageToSend = "This product image and details will be shared shortly. 📦";
                    }
                }
            } 
            // Handle Range Match
            else if (parsed.rangeName) {
                const matchingRanges = rangePdfs.filter((r: any) => 
                    r.name.toLowerCase() === parsed.rangeName.toLowerCase()
                );

                if (matchingRanges.length > 0) {
                    if (matchingRanges.length > 1) {
                        messageToSend = `Here are the PDFs for *${parsed.rangeName}*. 📄`;
                        rangePdfsToSend = matchingRanges;
                    } else {
                        const range = matchingRanges[0];
                        const divisionInfo = range.division ? ` (${range.division})` : "";
                        messageToSend = `Here is the PDF for *${range.name}*${divisionInfo}. 📄`;
                        rangePdfsToSend = [range];
                    }
                } else {
                    messageToSend = `I couldn't find the PDF for ${parsed.rangeName}. Please check the name and try again.`;
                }
            }
            // Handle Full Catalogue
            else if (parsed.fullCatalogue) {
                messageToSend = `It sounds like you're looking for our full product catalog! You can find all of our products listed here: https://cafoli.in/allproduct.aspx 📚\n\nI am also sending you all our range PDFs below. 👇`;
                rangePdfsToSend = rangePdfs; 
            }
            else if (parsed.message) {
                messageToSend = parsed.message;
            }
        }
    } catch (e) {
        console.log("Failed to parse AI JSON response:", e);
    }

    // 5. Send message immediately via WhatsApp
    
    // Send initial text message
    await ctx.runAction(api.whatsapp.sendWhatsAppMessage, {
        phoneNumber: args.phoneNumber,
        message: messageToSend,
        leadId: args.leadId,
        quotedMessageId: args.replyingToMessageId,
        quotedMessageExternalId: args.replyingToExternalId,
    });
    
    console.log(`Sending ${mediasToSend.length} product images...`);
    
    // Send Product Images FIRST (before Range PDFs)
    for (const media of mediasToSend) {
        console.log(`Sending product image: ${media.fileName} with storageId: ${media.storageId}`);
        try {
            await ctx.runAction(api.whatsapp.sendWhatsAppMedia, {
                phoneNumber: args.phoneNumber,
                message: media.caption || "",
                leadId: args.leadId,
                storageId: media.storageId,
                fileName: media.fileName,
                mimeType: media.mimeType,
            });
            console.log(`Successfully sent image: ${media.fileName}`);
        } catch (error) {
            console.error(`Failed to send image ${media.fileName}:`, error);
        }
    }
    
    console.log(`Sending ${rangePdfsToSend.length} range PDFs...`);
    
    // Send Range PDFs
    for (const range of rangePdfsToSend) {
        const caption = range.category === "THERAPEUTIC" 
            ? `${range.name} (Therapeutic Range)`
            : `${range.name}${range.division ? ` (${range.division})` : ""}`;

        try {
            await ctx.runAction(api.whatsapp.sendWhatsAppMedia, {
                phoneNumber: args.phoneNumber,
                message: caption,
                leadId: args.leadId,
                storageId: range.storageId,
                fileName: `${range.name}.pdf`,
                mimeType: "application/pdf",
            });
            console.log(`Successfully sent range PDF: ${range.name}`);
        } catch (error) {
            console.error(`Failed to send range PDF ${range.name}:`, error);
        }
    }

    // 6. If product not found, create intervention request
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