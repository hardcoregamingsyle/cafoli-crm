export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === "GET") {
      return new Response("Cloudflare Worker is running! Method must be POST to send files.", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    // Verify Auth Token
    const authHeader = request.headers.get("Authorization");
    const expectedToken = env.WORKER_AUTH_TOKEN;
    
    if (!expectedToken || !authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ 
        error: "Unauthorized", 
        details: !expectedToken ? "WORKER_AUTH_TOKEN not set in Worker" : "Token mismatch" 
      }), { status: 401, headers: corsHeaders });
    }

    try {
      const { phoneNumber, files } = await request.json();

      if (!phoneNumber || !files || !Array.isArray(files)) {
        throw new Error("Invalid request body. Expected { phoneNumber, files: [] }");
      }

      console.log(`[Worker] Processing ${files.length} files for ${phoneNumber}`);

      const results = [];
      const errors = [];

      for (const file of files) {
        try {
          console.log(`[Worker] Processing File: ${file.fileName}`);

          // 1. Download from Convex (or any URL)
          console.log(`[Worker] Downloading from: ${file.url}`);
          const downloadRes = await fetch(file.url, {
            headers: { 
              "User-Agent": "Cloudflare-Worker-WhatsApp-Relay/1.0" 
            }
          });

          if (!downloadRes.ok) {
            throw new Error(`Failed to download file: ${downloadRes.status} ${downloadRes.statusText}`);
          }

          const blob = await downloadRes.blob();
          console.log(`[Worker] Downloaded. Size: ${blob.size} bytes, Type: ${blob.type}`);

          // 2. Upload to WhatsApp
          console.log(`[Worker] Uploading to WhatsApp...`);
          const formData = new FormData();
          formData.append("file", blob, file.fileName);
          formData.append("messaging_product", "whatsapp");
          formData.append("type", file.mimeType || blob.type);

          const uploadRes = await fetch(
            `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/media`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${env.CLOUD_API_ACCESS_TOKEN}`,
              },
              body: formData,
            }
          );

          const uploadData = await uploadRes.json();

          if (!uploadRes.ok) {
            console.error("[Worker] WhatsApp Upload Error:", JSON.stringify(uploadData));
            throw new Error(`WhatsApp Media Upload Failed: ${uploadData.error?.message || JSON.stringify(uploadData)}`);
          }

          const mediaId = uploadData.id;
          console.log(`[Worker] Uploaded. Media ID: ${mediaId}`);

          // 3. Send Message
          let messageType = "document";
          if (file.mimeType.startsWith("image")) messageType = "image";
          else if (file.mimeType.startsWith("video")) messageType = "video";
          else if (file.mimeType.startsWith("audio")) messageType = "audio";

          const messagePayload = {
            messaging_product: "whatsapp",
            to: phoneNumber,
            type: messageType,
            [messageType]: {
              id: mediaId,
              // Only send filename for documents to avoid issues with other types
              ...(messageType === 'document' ? { filename: file.fileName } : {})
            }
          };

          console.log(`[Worker] Sending message type: ${messageType}`);
          const sendRes = await fetch(
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

          const sendData = await sendRes.json();

          if (!sendRes.ok) {
            console.error("[Worker] WhatsApp Send Error:", JSON.stringify(sendData));
            throw new Error(`WhatsApp Message Send Failed: ${sendData.error?.message || JSON.stringify(sendData)}`);
          }

          results.push({ fileName: file.fileName, status: "sent", messageId: sendData.messages?.[0]?.id });
          console.log(`[Worker] Sent successfully.`);

        } catch (fileError) {
          console.error(`[Worker] Error processing file ${file.fileName}:`, fileError);
          errors.push({ fileName: file.fileName, error: fileError.message });
        }
      }

      return new Response(JSON.stringify({ 
        success: errors.length === 0, 
        results, 
        errors 
      }), { 
        status: errors.length > 0 ? 207 : 200, // 207 Multi-Status if some failed
        headers: corsHeaders 
      });

    } catch (err) {
      console.error("[Worker] Critical Error:", err);
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  },
};
