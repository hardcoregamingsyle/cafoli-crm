"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Helper to strip markdown code blocks from JSON
function extractJsonFromMarkdown(text: string): string {
  // Try to find JSON inside 
}