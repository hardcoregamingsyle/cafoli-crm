import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Test suite for AI functionality
 * Run with: npx convex run test_ai:runAllTests
 */

export const testContactRequestDetection = action({
  args: {
    testMessage: v.string(),
    expectedResult: v.boolean(),
  },
  handler: async (ctx, args) => {
    try {
      const systemPrompt = `Analyze if the following message is a request for human contact or intervention.
      Return a JSON object with the following fields:
      - wantsContact: boolean
      - confidence: number (0-1)
      - reason: string`;

      const response = await ctx.runAction(api.ai.generateJson, {
        prompt: args.testMessage,
        systemPrompt: systemPrompt,
      });

      let detection;
      try {
        detection = JSON.parse(response as string);
      } catch (e) {
        // Try to clean up markdown if present (though generateJson should handle it)
        const cleaned = (response as string).replace(/```json/g, '').replace(/```/g, '');
        try {
          detection = JSON.parse(cleaned);
        } catch (e) {
          // If still not valid JSON, return default
          detection = { wantsContact: false, confidence: 0, reason: "Invalid JSON response" };
        }
      }

      const actualResult = detection.wantsContact === true;
      const passed = actualResult === args.expectedResult;

      return {
        success: true,
        passed,
        testMessage: args.testMessage,
        expected: args.expectedResult,
        actual: actualResult,
        confidence: detection.confidence,
        reason: detection.reason,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const testProductQuery = action({
  args: {
    testMessage: v.string(),
    expectedProductName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    try {
      const products: any = await ctx.runQuery(api.products.listProducts);
      const productNames = products.map((p: any) => p.name).join(", ");

      const systemPrompt = `You are a helpful assistant. Available Products: ${productNames}.
      Identify if any of the available products are mentioned in the message.
      Return a JSON object with:
      - productName: string (the exact name of the product found, or null if none found)`;

      const response = await ctx.runAction(api.ai.generateJson, {
        prompt: args.testMessage,
        systemPrompt: systemPrompt,
      }) as string;

      let detectedProduct = null;
      try {
        const trimmed = response.trim();
        // Clean markdown if needed
        const cleaned = trimmed.replace(/```json/g, '').replace(/```/g, '');
        try {
          const parsed = JSON.parse(cleaned);
          detectedProduct = parsed.productName;
        } catch (e) {
          // If still not valid JSON, return default
          detectedProduct = null;
        }
      } catch (e) {
        // If parsing fails, return default
        detectedProduct = null;
      }

      const passed = args.expectedProductName 
        ? detectedProduct === args.expectedProductName
        : detectedProduct !== null;

      return {
        success: true,
        passed,
        testMessage: args.testMessage,
        expectedProduct: args.expectedProductName,
        detectedProduct,
        response: response.substring(0, 200), // First 200 chars
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const runAllTests = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    const results: any[] = [];

    // Contact Request Detection Tests
    const contactTests = [
      { message: "I want to talk to your representative", expected: true },
      { message: "Can I speak with someone from your team?", expected: true },
      { message: "I need to contact a salesperson", expected: true },
      { message: "Connect me with your agent", expected: true },
      { message: "What is the price of this product?", expected: false },
      { message: "Hello, how are you?", expected: false },
      { message: "Tell me about your company", expected: false },
    ];

    for (const test of contactTests) {
      const result: any = await ctx.runAction(api.test_ai.testContactRequestDetection, {
        testMessage: test.message,
        expectedResult: test.expected,
      });
      results.push({ type: "contact_detection", ...result });
    }

    // Product Query Tests
    const productTests = [
      { message: "What is the price of VAONOPULSE?", expectedProduct: "VAONOPULSE" },
      { message: "Show me details of VAONOPULSE", expectedProduct: "VAONOPULSE" },
      { message: "I need information about VAONOPULSE", expectedProduct: "VAONOPULSE" },
      { message: "Tell me about your company", expectedProduct: undefined },
    ];

    for (const test of productTests) {
      const result: any = await ctx.runAction(api.test_ai.testProductQuery, {
        testMessage: test.message,
        expectedProductName: test.expectedProduct,
      });
      results.push({ type: "product_query", ...result });
    }

    const totalTests: number = results.length;
    const passedTests: number = results.filter((r: any) => r.passed).length;
    const failedTests = totalTests - passedTests;

    return {
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        successRate: `${((passedTests / totalTests) * 100).toFixed(1)}%`,
      },
      results,
    };
  },
});