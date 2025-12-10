import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";

const http = httpRouter();

auth.addHttpRoutes(http);

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
        tokensMatch: token === verifyToken
      });

      if (mode === "subscribe" && token === verifyToken) {
        console.log("✅ Webhook verified successfully");
        return new Response(challenge || "", { 
          status: 200,
          headers: { "Content-Type": "text/plain" }
        });
      } else {
        console.error("❌ Webhook verification failed:", { 
          mode, 
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

// WhatsApp webhook for incoming messages (POST)
http.route({
  path: "/webhooks/whatsapp",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const body = await req.json();
      
      console.log("Received WhatsApp webhook:", JSON.stringify(body, null, 2));

      // Process incoming messages
      if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
        const messages = body.entry[0].changes[0].value.messages;
        
        for (const message of messages) {
          await ctx.runAction(internal.whatsapp.handleIncomingMessage, {
            from: message.from,
            messageId: message.id,
            timestamp: message.timestamp,
            text: message.text?.body || "",
            type: message.type,
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

      // Check if lead already exists
      const exists = await ctx.runQuery(internal.indiamartMutations.checkIndiamartLeadExists, {
        uniqueQueryId,
      });

      if (exists) {
        console.log(`IndiaMART lead ${uniqueQueryId} already exists, skipping`);
        return new Response(JSON.stringify({ success: true, message: "Lead already exists" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Create the lead
      await ctx.runMutation(internal.indiamartMutations.createIndiamartLead, {
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