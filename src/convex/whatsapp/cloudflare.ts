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

    // Log configuration (masked) for debugging
    console.log(`[CLOUDFLARE_RELAY] Config Check: URL=${workerUrl}, Token=${workerToken.substring(0, 3)}...${workerToken.slice(-3)} (Length: ${workerToken.length})`);
    console.log(`[CLOUDFLARE_RELAY] Sending ${args.files.length} files to worker...`);

    try {
      const response = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${workerToken}`,
        },
        body: JSON.stringify({
          phoneNumber: args.phoneNumber,
          files: args.files,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[CLOUDFLARE_RELAY] Worker Error (${response.status}): ${text}`);
        
        if (response.status === 401) {
          throw new Error(`Cloudflare Worker Unauthorized. Check CLOUDFLARE_WORKER_TOKEN in Convex matches WORKER_AUTH_TOKEN in Cloudflare. Sent token length: ${workerToken.length}`);
        }
        
        throw new Error(`Cloudflare Worker failed (${response.status}): ${text}`);
      }

      const result = await response.json();
      console.log(`[CLOUDFLARE_RELAY] Success:`, result);
      return result;
    } catch (error) {
      console.error(`[CLOUDFLARE_RELAY] Request failed:`, error);
      throw error;
    }
  },
});