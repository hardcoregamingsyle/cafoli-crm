import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

function generateSearchText(data: {
  name?: string;
  subject?: string;
  mobile?: string;
  altMobile?: string;
  email?: string;
  altEmail?: string;
  message?: string;
}) {
  return [
    data.name,
    data.subject,
    data.mobile,
    data.altMobile,
    data.email,
    data.altEmail,
    data.message
  ].filter(Boolean).join(" ");
}

export const backfillSearchText = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = args.numItems || 100;
    const { page, isDone, continueCursor } = await ctx.db
      .query("leads")
      .paginate({ cursor: args.cursor || null, numItems });

    let count = 0;
    for (const lead of page) {
      if (!lead.searchText) {
        const searchText = generateSearchText({
          name: lead.name,
          subject: lead.subject,
          mobile: lead.mobile,
          altMobile: lead.altMobile,
          email: lead.email,
          altEmail: lead.altEmail,
          message: lead.message,
        });
        await ctx.db.patch(lead._id, { searchText });
        count++;
      }
    }

    return {
      count,
      isDone,
      continueCursor,
    };
  },
});

export const cleanupTransientData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Delete batchProcessControl records older than 24 hours
    const oldBatchControls = await ctx.db
      .query("batchProcessControl")
      .take(200);
    let batchDeleted = 0;
    for (const record of oldBatchControls) {
      const updatedAt = record.updatedAt ?? record._creationTime;
      if (updatedAt < oneDayAgo) {
        await ctx.db.delete(record._id);
        batchDeleted++;
      }
    }

    // Delete exportLogs older than 7 days
    const oldExportLogs = await ctx.db
      .query("exportLogs")
      .take(200);
    let exportDeleted = 0;
    for (const record of oldExportLogs) {
      const ts = record.exportedAt ?? record.timestamp ?? record._creationTime;
      if (ts < sevenDaysAgo) {
        await ctx.db.delete(record._id);
        exportDeleted++;
      }
    }

    // Delete completed/failed campaignExecutions older than 7 days
    const oldExecutions = await ctx.db
      .query("campaignExecutions")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .take(200);
    let execDeleted = 0;
    for (const record of oldExecutions) {
      const ts = record.executedAt ?? record._creationTime;
      if (ts < sevenDaysAgo) {
        await ctx.db.delete(record._id);
        execDeleted++;
      }
    }

    return { batchDeleted, exportDeleted, execDeleted };
  },
});