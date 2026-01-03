"use node";

import { action, internalAction, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// Get next available API key from database with rotation
async function getNextApiKey(ctx: ActionCtx): Promise<{ key: string; keyId: Id<"brevoApiKeys"> } | null> {
  // Cast internal to any to avoid "Type instantiation is excessively deep" error
  // @ts-ignore
  const internalAny: any = internal;
  const keys = await ctx.runQuery(internalAny.brevoQueries.getActiveKeys) as Doc<"brevoApiKeys">[];
  
  if (!keys || keys.length === 0) {
    console.error("No active Brevo API keys found in database");
    return null;
  }

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Reset usage counts for keys where 24 hours have passed
  for (const key of keys) {
    if (now - key.lastResetAt > oneDayMs) {
      await ctx.runMutation(internal.brevoMutations.resetDailyUsageInternal, { keyId: key._id });
    }
  }

  // Find first key that hasn't hit its limit
  for (const key of keys) {
    const resetTime = now - key.lastResetAt > oneDayMs ? now : key.lastResetAt;
    const usageCount = now - key.lastResetAt > oneDayMs ? 0 : key.usageCount;
    
    if (usageCount < (key.dailyLimit || 300)) {
      return { key: key.apiKey, keyId: key._id };
    }
  }

  console.error("All Brevo API keys have reached their daily limit");
  return null;
}

// Increment usage count for a key
async function incrementKeyUsage(ctx: ActionCtx, keyId: Id<"brevoApiKeys">) {
  await ctx.runMutation(internal.brevoQueries.incrementUsage, { keyId });
}

export const sendEmailInternal = internalAction({
  args: {
    to: v.string(),
    toName: v.string(),
    subject: v.string(),
    htmlContent: v.string(),
    textContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const keyData = await getNextApiKey(ctx);
    
    if (!keyData) {
      throw new Error("No available Brevo API keys. Please add keys in Admin panel.");
    }

    const cleanEmail = args.to.trim();
    if (!cleanEmail) {
      throw new Error("Email address is required");
    }

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": keyData.key,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Cafoli Connect",
            email: "welcome@mail.skinticals.com",
          },
          to: [
            {
              email: cleanEmail,
              name: args.toName,
            },
          ],
          subject: args.subject,
          htmlContent: args.htmlContent,
          textContent: args.textContent || args.htmlContent.replace(/<[^>]*>/g, ""),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Brevo API error:", data);
        
        // If rate limit error, try next key
        if (response.status === 429 || (data.code === "too_many_requests")) {
          console.log("Rate limit hit, marking key as exhausted");
          // The key will be skipped on next call due to usage count
          await incrementKeyUsage(ctx, keyData.keyId);
          
          // Retry with next key
          const nextKeyData = await getNextApiKey(ctx);
          if (nextKeyData) {
            return await sendEmailWithKey(ctx, { ...args, to: cleanEmail }, nextKeyData);
          }
        }
        
        throw new Error(`Failed to send email: ${JSON.stringify(data)}`);
      }

      // Increment usage count on success
      await incrementKeyUsage(ctx, keyData.keyId);

      console.log("Email sent successfully:", data);
      return { success: true, messageId: data.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error(`Email sending failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});

// Helper function to send email with a specific key
async function sendEmailWithKey(ctx: ActionCtx, args: any, keyData: { key: string; keyId: Id<"brevoApiKeys"> }) {
  const cleanEmail = args.to.trim();
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": keyData.key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: "Cafoli Connect",
        email: "welcome@mail.skinticals.com",
      },
      to: [
        {
          email: cleanEmail,
          name: args.toName,
        },
      ],
      subject: args.subject,
      htmlContent: args.htmlContent,
      textContent: args.textContent || args.htmlContent.replace(/<[^>]*>/g, ""),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to send email: ${JSON.stringify(data)}`);
  }

  await incrementKeyUsage(ctx, keyData.keyId);
  return { success: true, messageId: data.messageId };
}

// Helper for welcome email with specific key
async function sendWelcomeEmailWithKey(ctx: ActionCtx, args: any, keyData: { key: string; keyId: Id<"brevoApiKeys"> }, htmlContent: string) {
  const cleanEmail = args.leadEmail.trim();
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": keyData.key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: "Cafoli Connect",
        email: "welcome@mail.skinticals.com",
      },
      to: [
        {
          email: cleanEmail,
          name: args.leadName,
        },
      ],
      subject: "Welcome to Cafoli Connect - We've Received Your Inquiry",
      htmlContent,
      textContent: htmlContent.replace(/<[^>]*>/g, ""),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to send email: ${JSON.stringify(data)}`);
  }

  await incrementKeyUsage(ctx, keyData.keyId);
  return { success: true, messageId: data.messageId };
}

// Public action wrapper for external use
export const sendEmail = action({
  args: {
    to: v.string(),
    toName: v.string(),
    subject: v.string(),
    htmlContent: v.string(),
    textContent: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; messageId?: string }> => {
    return await ctx.runAction(internal.brevo.sendEmailInternal, args);
  },
});

export const sendWelcomeEmail = internalAction({
  args: {
    leadName: v.string(),
    leadEmail: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const keyData = await getNextApiKey(ctx);
    
    if (!keyData) {
      throw new Error("No available Brevo API keys. Please add keys in Admin panel.");
    }

    const cleanEmail = args.leadEmail.trim();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Cafoli Connect!</h1>
            </div>
            <div class="content">
              <p>Dear ${args.leadName},</p>
              
              <p>Thank you for your interest! We've received your inquiry through <strong>${args.source}</strong> and our team is excited to connect with you.</p>
              
              <p>Our dedicated team will review your requirements and reach out to you shortly with personalized solutions tailored to your needs.</p>
              
              <p><strong>What happens next?</strong></p>
              <ul>
                <li>Our team will review your inquiry within 24 hours</li>
                <li>A dedicated representative will contact you to discuss your requirements</li>
                <li>We'll provide you with customized solutions and pricing</li>
              </ul>
              
              <p>If you have any immediate questions, feel free to reply to this email or contact us directly.</p>
              
              <p>Best regards,<br>
              <strong>The Cafoli Connect Team</strong></p>
            </div>
            <div class="footer">
              <p>This is an automated message from Cafoli Connect CRM</p>
              <p>© ${new Date().getFullYear()} Cafoli Connect. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": keyData.key,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Cafoli Connect",
            email: "welcome@mail.skinticals.com",
          },
          to: [
            {
              email: cleanEmail,
              name: args.leadName,
            },
          ],
          subject: "Welcome to Cafoli Connect - We've Received Your Inquiry",
          htmlContent,
          textContent: htmlContent.replace(/<[^>]*>/g, ""),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Brevo API error:", data);
        
        // If rate limit error, try next key
        if (response.status === 429 || (data.code === "too_many_requests")) {
          await incrementKeyUsage(ctx, keyData.keyId);
          const nextKeyData = await getNextApiKey(ctx);
          if (nextKeyData) {
            // Retry with welcome email content
            return await sendWelcomeEmailWithKey(ctx, { ...args, leadEmail: cleanEmail }, nextKeyData, htmlContent);
          }
        }
        
        throw new Error(`Failed to send email: ${JSON.stringify(data)}`);
      }

      await incrementKeyUsage(ctx, keyData.keyId);

      console.log("Welcome email sent successfully:", data);
      return { success: true, messageId: data.messageId };
    } catch (error) {
      console.error("Error sending welcome email:", error);
      throw new Error(`Email sending failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});