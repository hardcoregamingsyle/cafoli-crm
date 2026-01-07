export default {
  async fetch(request, env, ctx) {
    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Verify Authentication
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.WORKER_AUTH_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const { phoneNumber, files } = await request.json();

      if (!phoneNumber || !files || !Array.isArray(files)) {
        return new Response("Invalid request body", { status: 400 });
      }

      const results = [];

      for (const file of files) {
        try {
          // 1. Fetch file from Convex (or source URL)
          const fileResponse = await fetch(file.url);
          if (!fileResponse.ok) {
            throw new Error(`Failed to fetch file from source: ${fileResponse.statusText}`);
          }
          const blob = await fileResponse.blob();

          // 2. Upload to WhatsApp Media API
          const formData = new FormData();
          formData.append("file", blob, file.fileName);
          formData.append("messaging_product", "whatsapp");
          formData.append("type", file.mimeType);

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

          // 3. Send Message with Media
          const messageUrl = `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/messages`;
          
          let messagePayload = {
            messaging_product: "whatsapp",
            to: phoneNumber,
            type: "document", // Default
          };

          // Determine correct message type based on mimeType
          if (file.mimeType.startsWith("image/")) {
            messagePayload.type = "image";
            messagePayload.image = { id: mediaId };
          } else if (file.mimeType.startsWith("video/")) {
            messagePayload.type = "video";
            messagePayload.video = { id: mediaId };
          } else if (file.mimeType.startsWith("audio/")) {
            messagePayload.type = "audio";
            messagePayload.audio = { id: mediaId };
          } else {
            messagePayload.type = "document";
            messagePayload.document = { id: mediaId, filename: file.fileName };
          }

          const sendResponse = await fetch(messageUrl, {
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

        } catch (error) {
          console.error(`Error processing file ${file.fileName}:`, error);
          results.push({ fileName: file.fileName, status: "failed", error: error.message });
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { "Content-Type": "application/json" },
      });

    } catch (e) {
      return new Response(`Worker Error: ${e.message}`, { status: 500 });
    }
  },
};
