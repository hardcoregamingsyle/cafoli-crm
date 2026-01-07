export default {
  async fetch(request, env) {
    // Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (request.method === "GET") {
      return new Response("Cloudflare Worker is running! Method must be POST to send files.", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // 1. Authenticate the request from Convex
    const authHeader = request.headers.get("Authorization");
    const expectedToken = env.WORKER_AUTH_TOKEN;

    if (!expectedToken) {
      console.error("WORKER_AUTH_TOKEN is not set in Cloudflare environment variables.");
      return new Response("Server Error: WORKER_AUTH_TOKEN not set", { status: 500 });
    }

    if (!authHeader || authHeader.trim() !== `Bearer ${expectedToken.trim()}`) {
      console.error(`Unauthorized access attempt. Received: ${authHeader ? authHeader.substring(0, 10) + "..." : "null"}`);
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const payload = await request.json();
      const { phoneNumber, files } = payload;

      if (!phoneNumber || !files || !Array.isArray(files)) {
        return new Response("Invalid payload", { status: 400 });
      }

      const accessToken = env.CLOUD_API_ACCESS_TOKEN;
      const phoneNumberId = env.WA_PHONE_NUMBER_ID;

      if (!accessToken || !phoneNumberId) {
        return new Response("WhatsApp credentials not configured in Worker", { status: 500 });
      }

      console.log(`[Worker] Processing ${files.length} files for ${phoneNumber}`);

      // --- DEBUG: SEND TEXT MESSAGE FIRST ---
      // This helps verify if messages are getting through at all.
      try {
        console.log(`[Worker] Sending debug text message...`);
        const textPayload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phoneNumber,
          type: "text",
          text: { body: `[System] Sending ${files.length} file(s)...` }
        };
        
        const textResponse = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(textPayload)
        });
        
        const textData = await textResponse.json();
        if (!textResponse.ok) {
          console.error(`[Worker] Debug text failed:`, JSON.stringify(textData));
        } else {
          console.log(`[Worker] Debug text sent. ID: ${textData.messages?.[0]?.id}`);
        }
      } catch (e) {
        console.error(`[Worker] Failed to send debug text:`, e);
      }
      // --------------------------------------

      const results = [];
      const errors = [];

      // 2. Process each file
      for (const file of files) {
        try {
          console.log(`[Worker] Processing File: ${file.fileName}`);

          // A. Download from Convex
          console.log(`[Worker] Downloading from: ${file.url}`);
          const fileResponse = await fetch(file.url);
          
          if (!fileResponse.ok) {
            throw new Error(`Failed to download file: ${fileResponse.statusText}`);
          }

          // Use arrayBuffer to ensure binary integrity
          const arrayBuffer = await fileResponse.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: file.mimeType });
          
          console.log(`[Worker] Downloaded. Size: ${blob.size} bytes, Type: ${blob.type}`);

          // B. Upload to WhatsApp
          console.log(`[Worker] Uploading to WhatsApp ...`);
          const formData = new FormData();
          formData.append("file", blob, file.fileName);
          formData.append("messaging_product", "whatsapp");
          formData.append("type", file.mimeType); 

          const uploadResponse = await fetch(
            `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
              },
              body: formData,
            }
          );

          const uploadData = await uploadResponse.json();

          if (!uploadResponse.ok) {
            console.error(`[Worker] Upload failed:`, JSON.stringify(uploadData));
            throw new Error(`WhatsApp Upload Error: ${JSON.stringify(uploadData)}`);
          }

          const mediaId = uploadData.id;
          console.log(`[Worker] Uploaded. Media ID: ${mediaId}`);

          // C. Send Message
          let type = "document";
          if (file.mimeType.startsWith("image/")) type = "image";
          else if (file.mimeType.startsWith("video/")) type = "video";
          else if (file.mimeType.startsWith("audio/")) type = "audio";

          console.log(`[Worker] Sending message type: ${type}`);

          const messagePayload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNumber,
            type: type,
            [type]: {
              id: mediaId,
              caption: file.fileName // Optional: Add filename as caption
            }
          };

          if (type === "document") {
            messagePayload[type].filename = file.fileName;
          }

          const sendResponse = await fetch(
            `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(messagePayload),
            }
          );

          const sendData = await sendResponse.json();

          if (!sendResponse.ok) {
             console.error(`[Worker] Send failed:`, JSON.stringify(sendData));
             throw new Error(`WhatsApp Send Error: ${JSON.stringify(sendData)}`);
          }

          console.log(`[Worker] Sent successfully. Message ID: ${sendData.messages?.[0]?.id}`);
          results.push({ fileName: file.fileName, status: "sent", messageId: sendData.messages?.[0]?.id });

        } catch (err) {
          console.error(`[Worker] Error processing ${file.fileName}:`, err);
          errors.push({ fileName: file.fileName, error: err.message });
        }
      }

      return new Response(JSON.stringify({ success: true, results, errors }), {
        headers: { "Content-Type": "application/json" },
      });

    } catch (error) {
      console.error("[Worker] Fatal Error:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};