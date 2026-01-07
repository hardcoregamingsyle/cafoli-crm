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

    // Health Check
    if (request.method === "GET") {
      return new Response("Cloudflare Worker is running! Method must be POST to send files.", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // 1. Validate Environment Variables
    const WORKER_TOKEN = env.WORKER_AUTH_TOKEN;
    const WA_TOKEN = env.CLOUD_API_ACCESS_TOKEN;
    const PHONE_ID = env.WA_PHONE_NUMBER_ID;

    if (!WORKER_TOKEN || !WA_TOKEN || !PHONE_ID) {
      return new Response(
        JSON.stringify({ 
          error: "Configuration Error", 
          details: "Missing WORKER_AUTH_TOKEN, CLOUD_API_ACCESS_TOKEN, or WA_PHONE_NUMBER_ID in Cloudflare Variables." 
        }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Validate Request Token
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader.replace("Bearer ", "").trim() !== WORKER_TOKEN.trim()) {
      return new Response("Unauthorized: Invalid Token", { status: 401 });
    }

    try {
      const { phoneNumber, files } = await request.json();

      if (!phoneNumber || !files || !Array.isArray(files)) {
        return new Response("Invalid request body", { status: 400 });
      }

      console.log(`[START] Processing ${files.length} files for ${phoneNumber}`);

      // 3. Send Debug Text Message (To confirm connectivity)
      const debugRes = await fetch(
        `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNumber,
            type: "text",
            text: { body: `[System] Processing ${files.length} file(s)...` },
          }),
        }
      );
      
      if (!debugRes.ok) {
        const errText = await debugRes.text();
        console.error(`[DEBUG_MSG_FAIL] ${errText}`);
        // We continue anyway to try sending the file
      } else {
        console.log("[DEBUG_MSG_SENT] System message sent.");
      }

      const results = [];

      // 4. Process Each File
      for (const file of files) {
        try {
          console.log(`[FILE] Processing: ${file.fileName} (${file.mimeType})`);

          // A. Download from Convex
          const fileRes = await fetch(file.url);
          if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);
          
          const originalBlob = await fileRes.blob();
          
          // CRITICAL: Enforce MIME type to prevent corruption
          const blob = originalBlob.slice(0, originalBlob.size, file.mimeType);
          
          console.log(`[FILE] Downloaded ${blob.size} bytes. Type: ${blob.type}`);

          if (blob.size < 100) {
             console.warn(`[WARNING] File is suspiciously small (${blob.size} bytes). Might be an error text.`);
          }

          // B. Upload to WhatsApp
          const formData = new FormData();
          formData.append("file", blob, file.fileName);
          formData.append("messaging_product", "whatsapp");
          formData.append("type", file.mimeType); 

          const uploadRes = await fetch(
            `https://graph.facebook.com/v20.0/${PHONE_ID}/media`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${WA_TOKEN}`,
                // DO NOT SET CONTENT-TYPE HERE! Let fetch set the boundary.
              },
              body: formData,
            }
          );

          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) {
            throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
          }

          const mediaId = uploadData.id;
          console.log(`[FILE] Uploaded. Media ID: ${mediaId}`);

          // C. Send Media Message
          // Determine type: image, video, audio, document
          let type = "document";
          if (file.mimeType.startsWith("image/")) type = "image";
          else if (file.mimeType.startsWith("video/")) type = "video";
          else if (file.mimeType.startsWith("audio/")) type = "audio";

          const messagePayload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNumber,
            type: type,
            [type]: {
              id: mediaId,
              // Caption is allowed for images/videos/documents
              caption: file.fileName 
            }
          };
          
          // For documents, we can also specify filename
          if (type === "document") {
            messagePayload[type].filename = file.fileName;
          }

          console.log(`[FILE] Sending message with ID: ${mediaId} as ${type}...`);

          const sendRes = await fetch(
            `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${WA_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(messagePayload),
            }
          );

          const sendData = await sendRes.json();
          
          if (!sendRes.ok) {
            console.error(`[FILE] Send Failed: ${JSON.stringify(sendData)}`);
            throw new Error(`Send message failed: ${JSON.stringify(sendData)}`);
          }

          console.log(`[FILE] Message Sent! ID: ${sendData.messages?.[0]?.id}`);
          results.push({ fileName: file.fileName, status: "sent", messageId: sendData.messages?.[0]?.id });

        } catch (err) {
          console.error(`[FILE_ERROR] ${file.fileName}: ${err.message}`);
          results.push({ fileName: file.fileName, status: "failed", error: err.message });
        }
      }

      return new Response(JSON.stringify({ status: "completed", results }), {
        headers: { "Content-Type": "application/json" },
      });

    } catch (err) {
      console.error(`[FATAL] ${err.message}`);
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  },
};
