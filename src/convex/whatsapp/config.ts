"use node";

import { action } from "../_generated/server";

export const updateInterface = action({
  args: {},
  handler: async (ctx) => {
    const accessToken = process.env.CLOUD_API_ACCESS_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error("WhatsApp API not configured");
    }

    const results = {
      commands: false,
      iceBreakers: false,
      errors: [] as string[]
    };

    // The /commands endpoint is not valid for WhatsApp Cloud API.
    // We will attempt to set commands via conversational_automation if supported.
    // If commands are not supported, we will fallback to just setting Ice Breakers.
    
    try {
      const payload = {
        prompts: [
          "What are your business hours?",
          "Where are you located?",
          "I want to see your catalog",
          "What services do you offer?"
        ],
        commands: [
          {
            command_name: "image",
            description: "Send an image"
          },
          {
            command_name: "faq",
            description: "Frequently Asked Questions"
          }
        ]
      };
      
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/conversational_automation`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        console.error("Initial sync failed:", JSON.stringify(data));
        
        // If it fails, it's likely because 'commands' field is not supported or invalid.
        // Retry with only prompts (Ice Breakers)
        console.log("Retrying with only prompts (Ice Breakers)...");
        
        const retryPayload = { prompts: payload.prompts };
        const retryResponse = await fetch(
          `https://graph.facebook.com/v20.0/${phoneNumberId}/conversational_automation`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(retryPayload),
          }
        );
        
        if (!retryResponse.ok) {
           const retryData = await retryResponse.json();
           results.errors.push(`Sync Error: ${JSON.stringify(retryData)}`);
        } else {
           results.iceBreakers = true;
           results.errors.push("Note: Slash commands are not supported via API, only Ice Breakers were set.");
        }
      } else {
        results.iceBreakers = true;
        results.commands = true;
      }
    } catch (e) {
      results.errors.push(`Exception: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    return results;
  }
});
