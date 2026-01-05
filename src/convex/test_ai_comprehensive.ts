import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

/**
 * Comprehensive AI Testing Suite
 * Tests AI model performance, WhatsApp AI integration, and usage monitoring
 * Run with: npx convex run test_ai_comprehensive:runComprehensiveTests
 */

export const testWhatsAppAiFlow = action({
  args: {
    testScenario: v.string(),
    userMessage: v.string(),
    expectedAction: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Create a test lead
      const testLeadId = await ctx.runMutation(api.leads.standard.createLead, {
        name: "Test Lead AI",
        subject: "AI Testing",
        source: "Test",
        mobile: "+1234567890",
        email: "test@example.com",
        userId: "test_user" as any,
      });

      // Simulate WhatsApp AI response
      const context = {
        recentMessages: [
          { role: "user", content: args.userMessage }
        ],
        leadInfo: { name: "Test Lead AI" }
      };

      // This would normally trigger the AI, but we'll test the logic
      const products = await ctx.runQuery(api.products.listProducts);
      const rangePdfs = await ctx.runQuery(api.rangePdfs.listRangePdfs);

      const productNames = products.map((p: any) => p.name).join(", ");
      const pdfNames = rangePdfs.map((p: any) => p.name).join(", ");

      const systemPrompt = `You are a helpful CRM assistant for a pharmaceutical company.
      Available Products: ${productNames}
      Available Range PDFs: ${pdfNames}
      
      Analyze the user message and return ONLY a JSON object with one of these actions:
      { "action": "reply", "text": "your message" }
      { "action": "send_image", "text": "caption", "resource_name": "product name" }
      { "action": "send_pdf", "text": "caption", "resource_name": "pdf name" }
      { "action": "intervention_request", "text": "message", "reason": "reason" }
      { "action": "contact_request", "text": "message", "reason": "reason" }`;

      const response = await ctx.runAction(api.ai.generateJson, {
        prompt: `Context: ${JSON.stringify(context)}\n\nUser Message: ${args.userMessage}`,
        systemPrompt: systemPrompt,
      });

      const aiAction = response as any;

      // Validate the response
      if (!aiAction || !aiAction.action) {
        throw new Error("Invalid AI response: missing action");
      }

      // Check if the action matches the expected action
      if (args.expectedAction && aiAction.action !== args.expectedAction) {
        throw new Error(`Expected action "${args.expectedAction}" but got "${aiAction.action}"`);
      }

      return aiAction;
    } catch (error) {
      console.error("Error in testWhatsAppAiFlow:", error);
      throw error;
    }
  },
});