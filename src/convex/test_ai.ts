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
      // Get a test user - use getSystemUser instead
      const systemUser = await ctx.runQuery(api.users.getSystemUser);
      if (!systemUser) {
        return { success: false, error: "No system user found for testing" };
      }
      const testUserId = systemUser._id;

      const response = await ctx.runAction(api.ai.generateContent, {
        prompt: args.testMessage,
        type: "contact_request_detection",
        context: {},
        userId: testUserId,
      }) as string;

      const detection = JSON.parse(response.trim());
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
  handler: async (ctx, args) => {
    try {
      const systemUser = await ctx.runQuery(api.users.getSystemUser);
      if (!systemUser) {
        return { success: false, error: "No system user found for testing" };
      }
      const testUserId = systemUser._id;

      const products = await ctx.runQuery(api.products.listProducts);
      const productNames = products.map((p: any) => p.name).join(", ");

      const response = await ctx.runAction(api.ai.generateContent, {
        prompt: args.testMessage,
        type: "chat_reply",
        context: {
          availableProducts: productNames,
          recentMessages: [],
        },
        userId: testUserId,
      }) as string;

      let detectedProduct = null;
      try {
        const trimmed = response.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          const parsed = JSON.parse(trimmed);
          detectedProduct = parsed.productName;
        }
      } catch (e) {
        // Not JSON, that's okay for some tests
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