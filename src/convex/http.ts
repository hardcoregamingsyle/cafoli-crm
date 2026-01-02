import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// WhatsApp webhook verification (GET)
http.route({
  path: "/webhooks/whatsapp",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      const verifyToken = process.env.WEBHOOK_VERIFICATION_TOKEN || "cafoli_webhook_verify_2025";

      console.log("WhatsApp webhook verification attempt:", { 
        mode, 
        receivedToken: token, 
        expectedToken: verifyToken,
        challenge,
        tokensMatch: token === verifyToken,
        url: req.url
      });

      // Meta requires exact match and challenge to be returned as-is
      if (mode === "subscribe" && token === verifyToken) {
        if (!challenge) {
          console.error("❌ No challenge provided");
          return new Response("Bad Request", { status: 400 });
        }
        console.log("✅ Webhook verified successfully, returning challenge:", challenge);
        return new Response(challenge, { 
          status: 200,
          headers: { "Content-Type": "text/plain" }
        });
      } else {
        console.error("❌ Webhook verification failed:", { 
          modeCorrect: mode === "subscribe",
          tokenMatch: token === verifyToken,
          hasChallenge: !!challenge 
        });
        return new Response("Forbidden", { status: 403 });
      }
    } catch (error) {
      console.error("Webhook verification error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }),
});

// WhatsApp webhook for incoming messages and status updates (POST)
http.route({
  path: "/webhooks/whatsapp",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const body = await req.json();
      
      console.log("Received WhatsApp webhook:", JSON.stringify(body, null, 2));

      // Process status updates (sent, delivered, read)
      if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
        const statuses = body.entry[0].changes[0].value.statuses;
        
        for (const statusUpdate of statuses) {
          await ctx.runAction("whatsapp:handleStatusUpdate" as any, {
            messageId: statusUpdate.id,
            status: statusUpdate.status, // "sent", "delivered", "read", "failed"
          });
        }
      }

      // Process incoming messages
      if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
        const value = body.entry[0].changes[0].value;
        const messages = value.messages;
        const contacts = value.contacts || [];
        
        for (const message of messages) {
          // Extract sender name from contacts
          const contact = contacts.find((c: any) => c.wa_id === message.from);
          const senderName = contact?.profile?.name;

          // Extract text content - handle button replies and regular text
          let textContent = "";
          if (message.type === "button" && message.button) {
            // Button reply - extract the button text/payload
            textContent = message.button.text || message.button.payload || "";
          } else if (message.type === "interactive" && message.interactive) {
            // Interactive button reply
            if (message.interactive.type === "button_reply") {
              textContent = message.interactive.button_reply?.title || "";
            } else if (message.interactive.type === "list_reply") {
              textContent = message.interactive.list_reply?.title || "";
            }
          } else if (message.text?.body) {
            // Regular text message
            textContent = message.text.body;
          }

          // Extract media information based on message type
          let mediaId = null;
          let mediaCaption = null;
          let mediaMimeType = null;
          let mediaFilename = null;

          if (message.type === "image" && message.image) {
            mediaId = message.image.id;
            mediaCaption = message.image.caption;
            mediaMimeType = message.image.mime_type;
            textContent = textContent || mediaCaption || "";
          } else if (message.type === "document" && message.document) {
            mediaId = message.document.id;
            mediaCaption = message.document.caption;
            mediaMimeType = message.document.mime_type;
            mediaFilename = message.document.filename;
            textContent = textContent || mediaCaption || "";
          } else if (message.type === "video" && message.video) {
            mediaId = message.video.id;
            mediaCaption = message.video.caption;
            mediaMimeType = message.video.mime_type;
            textContent = textContent || mediaCaption || "";
          } else if (message.type === "audio" && message.audio) {
            mediaId = message.audio.id;
            mediaMimeType = message.audio.mime_type;
          }

          console.log(`Processing incoming message - Type: ${message.type}, Text: "${textContent}"`);

          await ctx.runAction("whatsapp:handleIncomingMessage" as any, {
            from: message.from,
            messageId: message.id,
            timestamp: message.timestamp,
            text: textContent,
            type: message.type,
            mediaId: mediaId || undefined,
            mediaMimeType: mediaMimeType || undefined,
            mediaFilename: mediaFilename || undefined,
            senderName,
            quotedMessageExternalId: message.context?.id,
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Webhook processing error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// IndiaMART webhook for incoming leads (POST)
http.route({
  path: "/webhooks/indiamart",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const body = await req.json();
      
      console.log("Received IndiaMART webhook:", JSON.stringify(body, null, 2));

      // Validate response structure
      if (body.CODE !== 200 || body.STATUS !== "SUCCESS" || !body.RESPONSE) {
        console.error("Invalid IndiaMART webhook payload");
        return new Response(JSON.stringify({ error: "Invalid payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const response = body.RESPONSE;
      const uniqueQueryId = response.UNIQUE_QUERY_ID;

      // Check if lead already exists by mobile number (primary) or unique query ID (fallback)
      const existing = await ctx.runQuery("indiamartMutations:checkIndiamartLeadExists" as any, {
        uniqueQueryId,
        mobile: response.SENDER_MOBILE || "",
      });

      if (existing) {
        if (existing.type === "Irrelevant") {
          await ctx.runMutation("indiamartMutations:reactivateLead" as any, {
            id: existing._id,
          });
          console.log(`Reactivated irrelevant IndiaMART lead: ${uniqueQueryId}`);
          return new Response(JSON.stringify({ success: true, message: "Lead reactivated" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Merge duplicate lead
        await ctx.runMutation("indiamartMutations:mergeIndiamartLead" as any, {
          id: existing._id,
          uniqueQueryId,
          name: response.SENDER_NAME,
          subject: response.SUBJECT,
          mobile: response.SENDER_MOBILE || "",
          altMobile: response.SENDER_MOBILE_ALT,
          email: response.SENDER_EMAIL,
          altEmail: response.SENDER_EMAIL_ALT,
          phone: response.SENDER_PHONE,
          altPhone: response.SENDER_PHONE_ALT,
          agencyName: response.SENDER_COMPANY,
          address: response.SENDER_ADDRESS,
          city: response.SENDER_CITY,
          state: response.SENDER_STATE,
          pincode: response.SENDER_PINCODE,
          message: response.QUERY_MESSAGE,
          metadata: {
            queryTime: response.QUERY_TIME,
            queryType: response.QUERY_TYPE,
            mcatName: response.QUERY_MCAT_NAME,
            productName: response.QUERY_PRODUCT_NAME,
            countryIso: response.SENDER_COUNTRY_ISO,
            callDuration: response.CALL_DURATION || undefined,
          },
        });

        console.log(`IndiaMART lead ${uniqueQueryId} merged successfully`);
        return new Response(JSON.stringify({ success: true, message: "Lead merged" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Create the lead
      await ctx.runMutation("indiamartMutations:createIndiamartLead" as any, {
        uniqueQueryId,
        name: response.SENDER_NAME,
        subject: response.SUBJECT,
        mobile: response.SENDER_MOBILE || "",
        altMobile: response.SENDER_MOBILE_ALT,
        email: response.SENDER_EMAIL,
        altEmail: response.SENDER_EMAIL_ALT,
        phone: response.SENDER_PHONE,
        altPhone: response.SENDER_PHONE_ALT,
        agencyName: response.SENDER_COMPANY,
        address: response.SENDER_ADDRESS,
        city: response.SENDER_CITY,
        state: response.SENDER_STATE,
        pincode: response.SENDER_PINCODE,
        message: response.QUERY_MESSAGE,
        metadata: {
          queryTime: response.QUERY_TIME,
          queryType: response.QUERY_TYPE,
          mcatName: response.QUERY_MCAT_NAME,
          productName: response.QUERY_PRODUCT_NAME,
          countryIso: response.SENDER_COUNTRY_ISO,
          callDuration: response.CALL_DURATION || undefined,
        },
      });

      console.log(`IndiaMART lead ${uniqueQueryId} created successfully`);

      return new Response(JSON.stringify({ success: true, message: "Lead created" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("IndiaMART webhook processing error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;