"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";

export const sendFilesViaWorker = internalAction({
  args: {
    phoneNumber: v.string(),
    files: v.array(v.object({
      url: v.string(),
      fileName: v.string(),
      mimeType: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Trim whitespace to avoid copy-paste errors
    const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.trim();
    const workerToken = process.env.CLOUDFLARE_WORKER_TOKEN?.trim();

    if (!workerUrl || !workerToken) {
      throw new Error("Cloudflare Worker not configured (Missing CLOUDFLARE_WORKER_URL or CLOUDFLARE_WORKER_TOKEN)");
    }

    // Clean phone number (remove spaces, dashes, plus signs)
    // WhatsApp API requires just the digits (e.g., 919876543210)
    const cleanedPhone = args.phoneNumber.replace(/[\s\-\+]/g, "");

    // Log configuration (masked) for debugging
    console.log(`[CLOUDFLARE_RELAY] Config Check: URL=${workerUrl}, Token=${workerToken.substring(0, 3)}...${workerToken.slice(-3)} (Length: ${workerToken.length})`);
    console.log(`[CLOUDFLARE_RELAY] Sending ${args.files.length} files to worker for ${cleanedPhone}...`);
    
    // Log file details (without full URLs to keep logs clean)
    args.files.forEach(f => console.log(` - File: ${f.fileName}, Type: ${f.mimeType}, URL Length: ${f.url.length}`));

    try {
      console.log(`[CLOUDFLARE_RELAY] Sending request to worker...`);
      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${workerToken}`,
        },
        body: JSON.stringify({
          phoneNumber: cleanedPhone,
          files: args.files,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[CLOUDFLARE_RELAY] Worker Error (${response.status}): ${text}`);
        
        if (response.status === 401) {
          throw new Error(`Cloudflare Worker Unauthorized. Check CLOUDFLARE_WORKER_TOKEN in Convex matches WORKER_AUTH_TOKEN in Cloudflare. Sent token length: ${workerToken.length}`);
        }

        if (text.includes("WORKER_AUTH_TOKEN not set")) {
           throw new Error("CONFIGURATION ERROR: 'WORKER_AUTH_TOKEN' is missing in Cloudflare. Go to Cloudflare Dashboard > Workers > [Your Worker] > Settings > Variables and add it.");
        }
        
        throw new Error(`Cloudflare Worker failed (${response.status}): ${text}`);
      }

      const result = await response.json();
      console.log(`[CLOUDFLARE_RELAY] Worker Response:`, JSON.stringify(result));
      
      // Check if any files failed inside the worker
      if (result.results) {
        const failures = result.results.filter((r: any) => r.status === "failed");
        if (failures.length > 0) {
          console.error(`[CLOUDFLARE_RELAY] Partial failure: ${failures.length} files failed to send.`);
          // We throw here to trigger the fallback in whatsappAi.ts
          throw new Error(`Worker reported failures: ${JSON.stringify(failures)}`);
        }
      }
      
      return result;
    } catch (error) {
      console.error(`[CLOUDFLARE_RELAY] Request failed:`, error);
      throw error;
    }
  },
});