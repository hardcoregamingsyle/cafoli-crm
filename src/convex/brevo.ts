"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";

// Hardcoded Brevo API keys with rotation support
const BREVO_API_KEYS = [
  "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",
  "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",
  "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",
  "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",
  "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",
];

let currentKeyIndex = 0;

// Get next API key in rotation
function getNextApiKey(): string {
  const key = BREVO_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % BREVO_API_KEYS.length;
  return key;
}

// Fallback to environment variable if needed
function getApiKey(): string {
  return process.env.BREVO_API_KEY || getNextApiKey();
}

interface BrevoEmailParams {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export const sendEmail = action({
  args: {
    to: v.string(),
    toName: v.string(),
    subject: v.string(),
    htmlContent: v.string(),
    textContent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = getApiKey();

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Cafoli Connect",
            email: "welcome@mail.skinticals.com",
          },
          to: [
            {
              email: args.to,
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
        throw new Error(`Failed to send email: ${JSON.stringify(data)}`);
      }

      console.log("Email sent successfully:", data);
      return { success: true, messageId: data.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error(`Email sending failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});

export const sendWelcomeEmail = internalAction({
  args: {
    leadName: v.string(),
    leadEmail: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = getApiKey();

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
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "Cafoli Connect",
            email: "welcome@mail.skinticals.com",
          },
          to: [
            {
              email: args.leadEmail,
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
        throw new Error(`Failed to send email: ${JSON.stringify(data)}`);
      }

      console.log("Welcome email sent successfully:", data);
      return { success: true, messageId: data.messageId };
    } catch (error) {
      console.error("Error sending welcome email:", error);
      throw new Error(`Email sending failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
});