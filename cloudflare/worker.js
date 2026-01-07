export default {
  async fetch(request, env) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Cloudflare Worker is running! Method must be POST to send files.", { status: 200 });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${env.WORKER_AUTH_TOKEN}`) {
      return new Response("Unauthorized: Invalid or missing WORKER_AUTH_TOKEN", { status: 401 });
    }

    try {
      const { phoneNumber, files } = await request.json();

      if (!phoneNumber || !files || !Array.isArray(files)) {
        return new Response("Invalid request body", { status: 400 });
      }

      // Send a processing message first
      await sendWhatsAppMessage(env, phoneNumber, "text", { body: "[System] Processing media files... (Optimized)" });

      const results = [];

      for (const file of files) {
        try {
          console.log(`Processing file: ${file.fileName}`);
          
          // 1. Fetch the file
          const fileResponse = await fetch(file.url);
          if (!fileResponse.ok) throw new Error(`Failed to fetch file from URL: ${fileResponse.status}`);
          
          const arrayBuffer = await fileResponse.arrayBuffer();
          
          // 2. Detect MIME type via Magic Bytes (CRITICAL FIX)
          // WhatsApp is very strict about MIME types matching the actual file content
          const detectedMime = getMimeTypeFromMagicBytes(arrayBuffer) || file.mimeType || "application/octet-stream";
          console.log(`MIME Detection: Provided=${file.mimeType}, Detected=${detectedMime}`);

          // 3. Upload to WhatsApp
          const mediaId = await uploadToWhatsApp(env, arrayBuffer, detectedMime, file.fileName);
          console.log(`Media Uploaded: ${mediaId}`);
          
          // 4. Send Message
          const messageType = detectedMime.startsWith("image/") ? "image" : 
                              detectedMime.startsWith("video/") ? "video" : 
                              detectedMime.startsWith("audio/") ? "audio" : "document";
                              
          const messageBody = { id: mediaId };
          if (messageType === "document") messageBody.filename = file.fileName;
          
          // Add caption if it's the first file (optional, can be customized)
          // if (results.length === 0) messageBody.caption = "Here are the requested files.";

          await sendWhatsAppMessage(env, phoneNumber, messageType, messageBody);
          console.log(`Message Sent!`);
          
          results.push({ fileName: file.fileName, status: "sent", mediaId });
          
        } catch (error) {
          console.error(`Failed to process ${file.fileName}:`, error);
          results.push({ fileName: file.fileName, status: "failed", error: error.message });
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (e) {
      return new Response(`Worker Error: ${e.message}`, { status: 500 });
    }
  }
};

// Helper: Magic Bytes Detection
function getMimeTypeFromMagicBytes(buffer) {
  const arr = new Uint8Array(buffer).subarray(0, 4);
  let header = "";
  for (let i = 0; i < arr.length; i++) {
    header += arr[i].toString(16).toUpperCase();
  }

  // JPEG (FF D8 FF)
  if (header.startsWith("FFD8FF")) return "image/jpeg";
  // PNG (89 50 4E 47)
  if (header === "89504E47") return "image/png";
  // PDF (25 50 44 46)
  if (header.startsWith("25504446")) return "application/pdf";
  // GIF (47 49 46 38)
  if (header.startsWith("47494638")) return "image/gif";
  // WEBP (RIFF....WEBP) - simplified check for RIFF
  if (header.startsWith("52494646")) return "image/webp"; 
  // MP4 (ftyp) - simplified check
  if (header.includes("66747970")) return "video/mp4";

  return null;
}

// Helper: Upload to WhatsApp
async function uploadToWhatsApp(env, arrayBuffer, mimeType, fileName) {
  const formData = new FormData();
  const blob = new Blob([arrayBuffer], { type: mimeType });
  formData.append("file", blob, fileName);
  formData.append("messaging_product", "whatsapp");

  const url = `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/media`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.CLOUD_API_ACCESS_TOKEN}`
    },
    body: formData
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`WhatsApp Upload Failed: ${JSON.stringify(data)}`);
  }
  
  return data.id;
}

// Helper: Send Message
async function sendWhatsAppMessage(env, to, type, content) {
  const url = `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/messages`;
  
  const body = {
    messaging_product: "whatsapp",
    to: to,
    type: type,
    [type]: content
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.CLOUD_API_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`WhatsApp Send Failed: ${JSON.stringify(data)}`);
  }
  return data;
}
