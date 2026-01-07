export default {
  async fetch(request, env, ctx) {
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

    // Health check endpoint
    if (request.method === "GET") {
      return new Response("Cloudflare Worker is running! Method must be POST to send files.", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // AUTHENTICATION CHECK
    const authHeader = request.headers.get("Authorization") || "";
    const providedToken = authHeader.replace("Bearer ", "").trim();
    const expectedToken = (env.WORKER_AUTH_TOKEN || "").trim();

    if (!expectedToken) {
      return new Response("Server Error: WORKER_AUTH_TOKEN not set in Cloudflare variables", { status: 500 });
    }

    if (providedToken !== expectedToken) {
      console.log(`Auth Failed. Provided: '${providedToken.substring(0,3)}...', Expected: '${expectedToken.substring(0,3)}...'`);
      return new Response(`Unauthorized. Token mismatch. Provided length: ${providedToken.length}, Expected length: ${expectedToken.length}`, { status: 401 });
    }

    try {
      const { phoneNumber, files } = await request.json();

      if (!phoneNumber || !files || !Array.isArray(files)) {
        return new Response("Invalid request body", { status: 400 });
      }

      const results = [];
      const errors = [];

      // Process files
      for (const file of files) {
        try {
          // 1. Fetch file from Convex (or wherever the URL points)
          const fileResponse = await fetch(file.url);
          if (!fileResponse.ok) {
            throw new Error(`Failed to download file: ${fileResponse.statusText}`);
          }
          const blob = await fileResponse.blob();

          // 2. Upload to WhatsApp
          const formData = new FormData();
          formData.append("messaging_product", "whatsapp");
          formData.append("file", blob, file.fileName);
          
          // Determine type based on mime
          const type = file.mimeType.startsWith("image") ? "image" : 
                       file.mimeType.startsWith("video") ? "video" : 
                       file.mimeType.startsWith("audio") ? "audio" : "document";

          const uploadUrl = `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/media`;
          
          const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.CLOUD_API_ACCESS_TOKEN}`,
            },
            body: formData,
          });

          const uploadData = await uploadResponse.json();
          
          if (!uploadResponse.ok) {
            throw new Error(`WhatsApp Upload Failed: ${JSON.stringify(uploadData)}`);
          }

          const mediaId = uploadData.id;

          // 3. Send Message
          const messagePayload = {
            messaging_product: "whatsapp",
            to: phoneNumber,
            type: type,
            [type]: { id: mediaId }
          };
          
          if (type === "document") {
            messagePayload[type].filename = file.fileName;
          }

          const sendUrl = `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/messages`;
          const sendResponse = await fetch(sendUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.CLOUD_API_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(messagePayload),
          });

          const sendData = await sendResponse.json();
          
          if (!sendResponse.ok) {
            throw new Error(`WhatsApp Send Failed: ${JSON.stringify(sendData)}`);
          }

          results.push({ fileName: file.fileName, status: "sent", messageId: sendData.messages?.[0]?.id });

        } catch (err) {
          console.error(`Error processing file ${file.fileName}:`, err);
          errors.push({ fileName: file.fileName, error: err.message });
        }
      }

      return new Response(JSON.stringify({ success: true, results, errors }), {
        headers: { "Content-Type": "application/json" },
      });

    } catch (err) {
      return new Response(`Worker Error: ${err.message}`, { status: 500 });
    }
  },
};
