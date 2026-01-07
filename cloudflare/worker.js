export default {
  async fetch(request, env) {
    // Handle CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Health check
    if (request.method === "GET") {
      return new Response("Cloudflare Worker is running! Method must be POST to send files.", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Verify Auth Token
    const authHeader = request.headers.get("Authorization");
    const expectedToken = env.WORKER_AUTH_TOKEN?.trim();
    
    if (!expectedToken) {
      return new Response(JSON.stringify({ error: "Configuration Error: WORKER_AUTH_TOKEN not set in Cloudflare" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!authHeader || authHeader.replace("Bearer ", "").trim() !== expectedToken) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid Token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const body = await request.json();
      const { phoneNumber, files } = body;

      if (!phoneNumber || !files || !Array.isArray(files)) {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      console.log(`[Worker] Processing ${files.length} files for ${phoneNumber}`);

      // 1. Send a Debug Text Message first to confirm connectivity
      console.log(`[Worker] Sending debug text message ...`);
      const debugResp = await fetch(
        `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.CLOUD_API_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNumber,
            type: "text",
            text: { body: `[System] Sending ${files.length} file(s)...` },
          }),
        }
      );
      
      const debugData = await debugResp.json();
      if (debugResp.ok) {
         console.log(`[Worker] Debug text sent. ID: ${debugData.messages?.[0]?.id}`);
      } else {
         console.error(`[Worker] Failed to send debug text:`, debugData);
      }

      const results = [];
      const errors = [];

      for (const file of files) {
        try {
          console.log(`[Worker] Processing File: ${file.fileName}`);
          
          // 2. Download file from Convex
          console.log(`[Worker] Downloading from: ${file.url}`);
          const fileResp = await fetch(file.url);
          
          if (!fileResp.ok) {
            throw new Error(`Failed to download file: ${fileResp.statusText}`);
          }
          
          const contentType = fileResp.headers.get("Content-Type") || file.mimeType;
          const arrayBuffer = await fileResp.arrayBuffer();
          console.log(`[Worker] Downloaded. Size: ${arrayBuffer.byteLength} bytes, Type: ${contentType}`);

          // 3. Upload to WhatsApp
          console.log(`[Worker] Uploading to WhatsApp ...`);
          const formData = new FormData();
          formData.append("messaging_product", "whatsapp");
          
          // Use File constructor if available for better metadata handling, fallback to Blob
          const blob = new Blob([arrayBuffer], { type: contentType });
          formData.append("file", blob, file.fileName);

          const uploadResp = await fetch(
            `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/media`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.CLOUD_API_ACCESS_TOKEN}`,
                // Do NOT set Content-Type header for FormData, let fetch handle boundary
              },
              body: formData,
            }
          );

          const uploadData = await uploadResp.json();
          
          if (!uploadResp.ok) {
            console.error(`[Worker] Upload failed:`, uploadData);
            throw new Error(`WhatsApp Media Upload Failed: ${JSON.stringify(uploadData)}`);
          }

          const mediaId = uploadData.id;
          console.log(`[Worker] Uploaded. Media ID: ${mediaId}`);

          // 4. Send Message
          let messageType = "document";
          if (contentType.startsWith("image/")) messageType = "image";
          else if (contentType.startsWith("video/")) messageType = "video";
          else if (contentType.startsWith("audio/")) messageType = "audio";
          
          console.log(`[Worker] Sending message type: ${messageType}`);

          const messagePayload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNumber,
            type: messageType,
            [messageType]: { id: mediaId }
          };
          
          // Add caption/filename for documents
          if (messageType === "document") {
             messagePayload[messageType].filename = file.fileName;
          }

          const sendResp = await fetch(
            `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/messages`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.CLOUD_API_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(messagePayload),
            }
          );

          const sendData = await sendResp.json();
          
          if (!sendResp.ok) {
            console.error(`[Worker] Send failed:`, sendData);
            throw new Error(`WhatsApp Send Failed: ${JSON.stringify(sendData)}`);
          }

          console.log(`[Worker] Sent successfully. Message ID: ${sendData.messages?.[0]?.id}`);
          results.push({ fileName: file.fileName, status: "sent", messageId: sendData.messages?.[0]?.id });

        } catch (err) {
          console.error(`[Worker] Error processing ${file.fileName}:`, err);
          errors.push({ fileName: file.fileName, error: err.message });
        }
      }

      return new Response(JSON.stringify({ success: true, results, errors }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      console.error(`[Worker] Global Error:`, err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
