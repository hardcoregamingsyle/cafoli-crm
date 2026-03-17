import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { ROLES } from "../schema";

type LeadDoc = Doc<"leads">;

function hasValue(value: unknown) {
  return !(
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

function isPhoneLikeName(name: string) {
  return /^\d+$/.test(name.replace(/\s/g, ""));
}

function buildMergePatch(keepLead: LeadDoc, duplicateLead: LeadDoc) {
  const patch: Record<string, unknown> = {
    lastActivity: Math.max(keepLead.lastActivity, duplicateLead.lastActivity),
  };

  const fillIfMissing = (field: keyof LeadDoc) => {
    const currentValue = keepLead[field];
    const incomingValue = duplicateLead[field];

    if (!hasValue(currentValue) && hasValue(incomingValue)) {
      patch[field] = incomingValue;
    }
  };

  fillIfMissing("subject");
  fillIfMissing("source");
  fillIfMissing("altMobile");
  fillIfMissing("email");
  fillIfMissing("altEmail");
  fillIfMissing("agencyName");
  fillIfMissing("pincode");
  fillIfMissing("state");
  fillIfMissing("district");
  fillIfMissing("station");
  fillIfMissing("message");
  fillIfMissing("type");
  fillIfMissing("assignedTo");
  fillIfMissing("assignedToName");
  fillIfMissing("nextFollowUpDate");
  fillIfMissing("pharmavendsUid");
  fillIfMissing("indiamartUniqueId");
  fillIfMissing("indiamartMetadata");
  fillIfMissing("aiScore");
  fillIfMissing("aiScoreTier");
  fillIfMissing("aiScoreRationale");
  fillIfMissing("aiScoredAt");
  fillIfMissing("coldCallerAssignedTo");
  fillIfMissing("coldCallerAssignedAt");
  fillIfMissing("welcomeEmailSent");

  if (isPhoneLikeName(keepLead.name) && !isPhoneLikeName(duplicateLead.name)) {
    patch.name = duplicateLead.name;
  }

  if (
    keepLead.priorityScore === undefined ||
    (duplicateLead.priorityScore !== undefined &&
      duplicateLead.priorityScore > keepLead.priorityScore)
  ) {
    patch.priorityScore = duplicateLead.priorityScore;
  }

  if (keepLead.adminAssignmentRequired === undefined && duplicateLead.adminAssignmentRequired !== undefined) {
    patch.adminAssignmentRequired = duplicateLead.adminAssignmentRequired;
  }

  if (keepLead.isColdCallerLead === undefined && duplicateLead.isColdCallerLead !== undefined) {
    patch.isColdCallerLead = duplicateLead.isColdCallerLead;
  }

  const mergedTags = Array.from(
    new Set([...(keepLead.tags ?? []), ...(duplicateLead.tags ?? [])]),
  );
  if (mergedTags.length > 0) {
    patch.tags = mergedTags;
  }

  const mergedSearchText = [
    keepLead.searchText,
    duplicateLead.searchText,
    duplicateLead.subject,
    duplicateLead.message,
    duplicateLead.email,
    duplicateLead.altEmail,
    duplicateLead.agencyName,
    duplicateLead.station,
    duplicateLead.district,
    duplicateLead.state,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  if (mergedSearchText) {
    patch.searchText = mergedSearchText;
  }

  return patch;
}

function formatLeadSnapshot(lead: LeadDoc) {
  const lines = [
    `Name: ${lead.name}`,
    `Mobile: ${lead.mobile}`,
    lead.subject ? `Subject: ${lead.subject}` : null,
    lead.source ? `Source: ${lead.source}` : null,
    lead.email ? `Email: ${lead.email}` : null,
    lead.altEmail ? `Alt Email: ${lead.altEmail}` : null,
    lead.altMobile ? `Alt Mobile: ${lead.altMobile}` : null,
    lead.agencyName ? `Agency: ${lead.agencyName}` : null,
    lead.station ? `Station: ${lead.station}` : null,
    lead.district ? `District: ${lead.district}` : null,
    lead.state ? `State: ${lead.state}` : null,
    lead.message ? `Message: ${lead.message}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

async function moveComments(ctx: any, fromLeadId: Id<"leads">, toLeadId: Id<"leads">) {
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_lead", (q: any) => q.eq("leadId", fromLeadId))
    .collect();

  await Promise.all(
    comments.map((comment: any) => ctx.db.patch(comment._id, { leadId: toLeadId })),
  );
}

async function moveFollowUps(ctx: any, fromLeadId: Id<"leads">, toLeadId: Id<"leads">) {
  const followUps = await ctx.db
    .query("followups")
    .withIndex("by_lead", (q: any) => q.eq("leadId", fromLeadId))
    .collect();

  await Promise.all(
    followUps.map((followUp: any) => ctx.db.patch(followUp._id, { leadId: toLeadId })),
  );
}

async function moveActivityLogs(ctx: any, fromLeadId: Id<"leads">, toLeadId: Id<"leads">) {
  const activityLogs = await ctx.db
    .query("activityLogs")
    .withIndex("by_lead", (q: any) => q.eq("leadId", fromLeadId))
    .collect();

  await Promise.all(
    activityLogs.map((log: any) => ctx.db.patch(log._id, { leadId: toLeadId })),
  );
}

async function moveActiveSessions(ctx: any, fromLeadId: Id<"leads">, toLeadId: Id<"leads">) {
  const sessions = await ctx.db
    .query("activeChatSessions")
    .withIndex("by_leadId", (q: any) => q.eq("leadId", fromLeadId))
    .collect();

  await Promise.all(
    sessions.map((session: any) => ctx.db.patch(session._id, { leadId: toLeadId })),
  );
}

async function moveLeadSummary(ctx: any, fromLeadId: Id<"leads">, toLeadId: Id<"leads">) {
  const summaries = await ctx.db
    .query("leadSummaries")
    .withIndex("by_lead", (q: any) => q.eq("leadId", fromLeadId))
    .collect();

  if (summaries.length === 0) return;

  const existingSummary = await ctx.db
    .query("leadSummaries")
    .withIndex("by_lead", (q: any) => q.eq("leadId", toLeadId))
    .first();

  if (!existingSummary) {
    await Promise.all(
      summaries.map((summary: any) => ctx.db.patch(summary._id, { leadId: toLeadId })),
    );
    return;
  }

  const latestDuplicateSummary = summaries.sort(
    (a: any, b: any) =>
      (b.generatedAt ?? b._creationTime) - (a.generatedAt ?? a._creationTime),
  )[0];

  const duplicateSummaryTime =
    latestDuplicateSummary.generatedAt ?? latestDuplicateSummary._creationTime;
  const existingSummaryTime = existingSummary.generatedAt ?? existingSummary._creationTime;

  if (duplicateSummaryTime > existingSummaryTime) {
    await ctx.db.patch(existingSummary._id, {
      summary: latestDuplicateSummary.summary,
      lastActivityHash: latestDuplicateSummary.lastActivityHash,
      generatedAt: latestDuplicateSummary.generatedAt,
    });
  }

  await Promise.all(summaries.map((summary: any) => ctx.db.delete(summary._id)));
}

async function moveChats(ctx: any, fromLeadId: Id<"leads">, toLeadId: Id<"leads">) {
  const duplicateChats = await ctx.db
    .query("chats")
    .withIndex("by_lead", (q: any) => q.eq("leadId", fromLeadId))
    .collect();

  if (duplicateChats.length === 0) return;

  let keepChat = await ctx.db
    .query("chats")
    .withIndex("by_lead", (q: any) => q.eq("leadId", toLeadId))
    .first();

  for (const duplicateChat of duplicateChats) {
    if (!keepChat) {
      await ctx.db.patch(duplicateChat._id, { leadId: toLeadId });
      keepChat = await ctx.db.get(duplicateChat._id);
      continue;
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q: any) => q.eq("chatId", duplicateChat._id))
      .collect();

    await Promise.all(
      messages.map((message: any) => ctx.db.patch(message._id, { chatId: keepChat!._id })),
    );

    await ctx.db.patch(keepChat._id, {
      unreadCount: (keepChat.unreadCount ?? 0) + (duplicateChat.unreadCount ?? 0),
      lastMessageAt: Math.max(keepChat.lastMessageAt ?? 0, duplicateChat.lastMessageAt ?? 0),
      platform: keepChat.platform ?? duplicateChat.platform,
    });

    keepChat = await ctx.db.get(keepChat._id);
    await ctx.db.delete(duplicateChat._id);
  }
}

async function mergeDuplicateLead(ctx: any, keepLead: LeadDoc, duplicateLead: LeadDoc) {
  const patch = buildMergePatch(keepLead, duplicateLead);

  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(keepLead._id, patch);
  }

  await ctx.db.insert("comments", {
    leadId: keepLead._id,
    content: `Merged duplicate lead and preserved its history.\n\n${formatLeadSnapshot(duplicateLead)}`,
    isSystem: true,
  });

  await moveComments(ctx, duplicateLead._id, keepLead._id);
  await moveFollowUps(ctx, duplicateLead._id, keepLead._id);
  await moveActivityLogs(ctx, duplicateLead._id, keepLead._id);
  await moveActiveSessions(ctx, duplicateLead._id, keepLead._id);
  await moveLeadSummary(ctx, duplicateLead._id, keepLead._id);
  await moveChats(ctx, duplicateLead._id, keepLead._id);

  await ctx.db.delete(duplicateLead._id);
}

export const deduplicateLeads = mutation({
  args: {
    adminId: v.id("users"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can deduplicate leads");
    }

    const allLeads = await ctx.db.query("leads").collect();
    const mobileMap = new Map<string, LeadDoc[]>();

    for (const lead of allLeads) {
      if (!lead.mobile) continue;
      const existing = mobileMap.get(lead.mobile) || [];
      existing.push(lead);
      mobileMap.set(lead.mobile, existing);
    }

    const duplicates: Array<{
      mobile: string;
      leads: Array<{ id: string; name: string; createdAt: number; source: string }>;
      keepId: string;
      deleteIds: string[];
    }> = [];

    for (const [mobile, leads] of mobileMap.entries()) {
      if (leads.length <= 1) continue;

      const sorted = [...leads].sort((a, b) => a._creationTime - b._creationTime);
      const keepLead = sorted[0];
      const deleteLeads = sorted.slice(1);

      duplicates.push({
        mobile,
        leads: sorted.map((lead) => ({
          id: lead._id,
          name: lead.name,
          createdAt: lead._creationTime,
          source: lead.source || "Unknown",
        })),
        keepId: keepLead._id,
        deleteIds: deleteLeads.map((lead) => lead._id),
      });
    }

    if (args.dryRun) {
      return {
        dryRun: true,
        duplicatesFound: duplicates.length,
        totalLeadsToDelete: duplicates.reduce((sum, duplicate) => sum + duplicate.deleteIds.length, 0),
        duplicates: duplicates.slice(0, 50),
      };
    }

    let deletedCount = 0;

    for (const duplicateGroup of duplicates) {
      const keepLead = await ctx.db.get(duplicateGroup.keepId as Id<"leads">);
      if (!keepLead) continue;

      for (const deleteId of duplicateGroup.deleteIds) {
        const duplicateLead = await ctx.db.get(deleteId as Id<"leads">);
        if (!duplicateLead) continue;

        await mergeDuplicateLead(ctx, keepLead, duplicateLead);
        deletedCount++;
      }
    }

    return {
      dryRun: false,
      duplicatesFound: duplicates.length,
      leadsDeleted: deletedCount,
      duplicates: duplicates.slice(0, 50),
    };
  },
});