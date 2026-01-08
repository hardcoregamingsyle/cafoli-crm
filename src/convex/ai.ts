"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { generateWithGemini } from "./lib/gemini";
import { internal } from "./_generated/api";

export const generate = action({
  args: {
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const systemPrompt = args.systemPrompt || "You are a helpful assistant.";
    const { text } = await generateWithGemini(ctx, systemPrompt, args.prompt);
    return text;
  },
});

export const generateJson = action({
  args: {
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const systemPrompt = args.systemPrompt || "You are a helpful assistant that outputs JSON.";
    const { text } = await generateWithGemini(ctx, systemPrompt, args.prompt, { jsonMode: true });
    return text;
  },
});

export const analyzeLeadComprehensive = action({
  args: {
    leadData: v.any(),
    comments: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const systemPrompt = `You are an expert CRM analyst specializing in pharmaceutical sales and lead qualification. 
    Provide a comprehensive, structured analysis of the lead with actionable insights.
    
    Your analysis should include:
    1. **Lead Quality Score** (1-10): Rate the lead's potential value
    2. **Key Strengths**: What makes this lead promising
    3. **Concerns/Red Flags**: Any issues or risks to address
    4. **Engagement Level**: How engaged is this lead based on their activity
    5. **Recommended Actions**: Specific next steps to move this lead forward
    6. **Product Recommendations**: Which products/services might interest them
    7. **Communication Strategy**: Best approach for follow-up
    8. **Timeline Suggestion**: When to follow up and why
    
    Be specific, actionable, and concise. Use bullet points for clarity.`;

    const leadInfo = {
      name: args.leadData.name,
      company: args.leadData.company,
      mobile: args.leadData.mobile,
      email: args.leadData.email,
      status: args.leadData.status,
      type: args.leadData.type,
      source: args.leadData.source,
      subject: args.leadData.subject,
      message: args.leadData.message,
      city: args.leadData.city,
      state: args.leadData.state,
      country: args.leadData.country,
      nextFollowUpDate: args.leadData.nextFollowUpDate,
      lastContactedAt: args.leadData.lastContactedAt,
      assignedTo: args.leadData.assignedTo,
      tags: args.leadData.tags,
      comments: args.comments || [],
    };

    const prompt = `Analyze this pharmaceutical lead comprehensively:\n\n${JSON.stringify(leadInfo, null, 2)}`;

    const { text } = await generateWithGemini(ctx, systemPrompt, prompt);
    return text;
  },
});

export const generateLeadSummary = action({
  args: {
    leadId: v.id("leads"),
    leadData: v.object({
      name: v.string(),
      subject: v.string(),
      source: v.string(),
      status: v.optional(v.string()),
      type: v.optional(v.string()),
      message: v.optional(v.string()),
      lastActivity: v.number(),
    }),
    recentComments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const systemPrompt = `You are a CRM assistant. Generate a concise 1-2 sentence summary of this lead for quick prioritization. Focus on: lead quality, urgency, and key action needed. Be brief and actionable.`;

    const leadInfo = {
      name: args.leadData.name,
      subject: args.leadData.subject,
      source: args.leadData.source,
      status: args.leadData.status,
      type: args.leadData.type,
      message: args.leadData.message,
      recentActivity: args.recentComments?.slice(0, 3) || [],
    };

    const prompt = `Summarize this lead in 1-2 sentences:\n\n${JSON.stringify(leadInfo, null, 2)}`;

    const { text } = await generateWithGemini(ctx, systemPrompt, prompt, { useGemma: true });
    
    // Store summary in cache
    const lastActivityHash = `${args.leadData.lastActivity}`;
    await ctx.runMutation(internal.aiMutations.storeSummary, {
      leadId: args.leadId,
      summary: text,
      lastActivityHash,
    });

    return text;
  },
});

export const generateLeadSummaryWithChat = action({
  args: {
    leadId: v.id("leads"),
    leadData: v.object({
      name: v.string(),
      subject: v.string(),
      source: v.string(),
      status: v.optional(v.string()),
      type: v.optional(v.string()),
      message: v.optional(v.string()),
      lastActivity: v.number(),
    }),
    recentComments: v.optional(v.array(v.string())),
    whatsappMessages: v.optional(v.array(v.object({
      direction: v.string(),
      content: v.string(),
      timestamp: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const systemPrompt = `You are a CRM assistant. Generate a concise 1-2 sentence summary of this lead for quick prioritization. Focus on: lead quality, urgency, key action needed, and recent engagement. Be brief and actionable.`;

    const leadInfo = {
      name: args.leadData.name,
      subject: args.leadData.subject,
      source: args.leadData.source,
      status: args.leadData.status,
      type: args.leadData.type,
      message: args.leadData.message,
      recentComments: args.recentComments?.slice(0, 3) || [],
      whatsappActivity: args.whatsappMessages ? {
        messageCount: args.whatsappMessages.length,
        recentMessages: args.whatsappMessages.slice(0, 5).map(m => `${m.direction}: ${m.content.substring(0, 100)}`),
      } : null,
    };

    const prompt = `Summarize this lead in 1-2 sentences:\n\n${JSON.stringify(leadInfo, null, 2)}`;

    const { text } = await generateWithGemini(ctx, systemPrompt, prompt, { useGemma: true });
    
    const lastActivityHash = `${args.leadData.lastActivity}`;
    await ctx.runMutation(internal.aiMutations.storeSummary, {
      leadId: args.leadId,
      summary: text,
      lastActivityHash,
    });

    return text;
  },
});

export const scoreLead = action({
  args: {
    leadId: v.id("leads"),
    leadData: v.object({
      name: v.string(),
      source: v.string(),
      status: v.optional(v.string()),
      type: v.optional(v.string()),
      assignedTo: v.optional(v.id("users")),
      tags: v.optional(v.array(v.id("tags"))),
      lastActivity: v.number(),
      nextFollowUpDate: v.optional(v.number()),
      createdAt: v.number(),
    }),
    commentCount: v.number(),
    messageCount: v.number(),
  },
  handler: async (ctx, args) => {
    const systemPrompt = `You are an AI lead scoring expert for pharmaceutical CRM. Score leads 0-100 based on:
    - Engagement (comments, messages, follow-ups)
    - Recency of activity
    - Lead type and status
    - Source quality
    
    Return JSON with: { "score": <number 0-100>, "tier": "<High|Medium|Low>", "rationale": "<brief explanation>" }`;

    const daysSinceCreated = (Date.now() - args.leadData.createdAt) / (1000 * 60 * 60 * 24);
    const daysSinceActivity = (Date.now() - args.leadData.lastActivity) / (1000 * 60 * 60 * 24);
    
    const leadInfo = {
      source: args.leadData.source,
      status: args.leadData.status,
      type: args.leadData.type,
      isAssigned: !!args.leadData.assignedTo,
      hasFollowUp: !!args.leadData.nextFollowUpDate,
      tagCount: args.leadData.tags?.length || 0,
      commentCount: args.commentCount,
      messageCount: args.messageCount,
      daysSinceCreated: Math.round(daysSinceCreated),
      daysSinceActivity: Math.round(daysSinceActivity),
    };

    const prompt = `Score this lead:\n\n${JSON.stringify(leadInfo, null, 2)}`;

    const { text } = await generateWithGemini(ctx, systemPrompt, prompt, { jsonMode: true, useGemma: true });
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Fallback scoring
      parsed = { score: 50, tier: "Medium", rationale: "Unable to generate AI score" };
    }

    // Store score
    await ctx.runMutation(internal.aiMutations.storeScore, {
      leadId: args.leadId,
      score: parsed.score,
      tier: parsed.tier,
      rationale: parsed.rationale,
    });

    return parsed;
  },
});

export const scoreLeadWithContext = action({
  args: {
    leadId: v.id("leads"),
    leadData: v.object({
      name: v.string(),
      source: v.string(),
      status: v.optional(v.string()),
      type: v.optional(v.string()),
      assignedTo: v.optional(v.id("users")),
      tags: v.optional(v.array(v.id("tags"))),
      lastActivity: v.number(),
      nextFollowUpDate: v.optional(v.number()),
      createdAt: v.number(),
    }),
    commentCount: v.number(),
    messageCount: v.number(),
    summary: v.optional(v.string()),
    whatsappMessages: v.optional(v.array(v.object({
      direction: v.string(),
      content: v.string(),
      timestamp: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const systemPrompt = `You are an AI lead scoring expert for pharmaceutical CRM. Score leads 0-100 based on:
    - Engagement (comments, messages, follow-ups)
    - Recency of activity
    - Lead type and status
    - Source quality
    - WhatsApp conversation quality and engagement
    - AI-generated summary insights
    
    Return JSON with: { "score": <number 0-100>, "tier": "<High|Medium|Low>", "rationale": "<brief explanation>" }`;

    const daysSinceCreated = (Date.now() - args.leadData.createdAt) / (1000 * 60 * 60 * 24);
    const daysSinceActivity = (Date.now() - args.leadData.lastActivity) / (1000 * 60 * 60 * 24);
    
    const whatsappEngagement = args.whatsappMessages ? {
      totalMessages: args.whatsappMessages.length,
      inboundCount: args.whatsappMessages.filter(m => m.direction === "inbound").length,
      outboundCount: args.whatsappMessages.filter(m => m.direction === "outbound").length,
      recentActivity: args.whatsappMessages.slice(0, 3).map(m => `${m.direction}: ${m.content.substring(0, 80)}`),
    } : null;

    const leadInfo = {
      source: args.leadData.source,
      status: args.leadData.status,
      type: args.leadData.type,
      isAssigned: !!args.leadData.assignedTo,
      hasFollowUp: !!args.leadData.nextFollowUpDate,
      tagCount: args.leadData.tags?.length || 0,
      commentCount: args.commentCount,
      messageCount: args.messageCount,
      daysSinceCreated: Math.round(daysSinceCreated),
      daysSinceActivity: Math.round(daysSinceActivity),
      aiSummary: args.summary,
      whatsappEngagement,
    };

    const prompt = `Score this lead:\n\n${JSON.stringify(leadInfo, null, 2)}`;

    const { text } = await generateWithGemini(ctx, systemPrompt, prompt, { jsonMode: true, useGemma: true });
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { score: 50, tier: "Medium", rationale: "Unable to generate AI score" };
    }

    await ctx.runMutation(internal.aiMutations.storeScore, {
      leadId: args.leadId,
      score: parsed.score,
      tier: parsed.tier,
      rationale: parsed.rationale,
    });

    return parsed;
  },
});

async function scoreLeadHelper(
  ctx: any,
  leadId: any,
  leadData: any,
  commentCount: number,
  messageCount: number
) {
  const systemPrompt = `You are an AI lead scoring expert for pharmaceutical CRM. Score leads 0-100 based on:
  - Engagement (comments, messages, follow-ups)
  - Recency of activity
  - Lead type and status
  - Source quality
  
  Return JSON with: { "score": <number 0-100>, "tier": "<High|Medium|Low>", "rationale": "<brief explanation>" }`;

  const daysSinceCreated = (Date.now() - leadData.createdAt) / (1000 * 60 * 60 * 24);
  const daysSinceActivity = (Date.now() - leadData.lastActivity) / (1000 * 60 * 60 * 24);
  
  const leadInfo = {
    source: leadData.source,
    status: leadData.status,
    type: leadData.type,
    isAssigned: !!leadData.assignedTo,
    hasFollowUp: !!leadData.nextFollowUpDate,
    tagCount: leadData.tags?.length || 0,
    commentCount,
    messageCount,
    daysSinceCreated: Math.round(daysSinceCreated),
    daysSinceActivity: Math.round(daysSinceActivity),
  };

  const prompt = `Score this lead:\n\n${JSON.stringify(leadInfo, null, 2)}`;

  const { text } = await generateWithGemini(ctx, systemPrompt, prompt, { jsonMode: true, useGemma: true });
  
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { score: 50, tier: "Medium", rationale: "Unable to generate AI score" };
  }

  await ctx.runMutation(internal.aiMutations.storeScore, {
    leadId,
    score: parsed.score,
    tier: parsed.tier,
    rationale: parsed.rationale,
  });

  return parsed;
}

export const scoreLeadsJob = action({
  args: {},
  handler: async (ctx): Promise<{ scored: number; total: number }> => {
    // Get active leads (assigned, not irrelevant, active in last 90 days)
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const leads: Array<any> = await ctx.runQuery(internal.aiMutations.getLeadsToScore, { since: ninetyDaysAgo });

    console.log(`Scoring ${leads.length} leads...`);

    let scored = 0;
    for (const lead of leads) {
      try {
        // Get comment and message counts
        const comments = await ctx.runQuery(internal.aiMutations.getCommentCount, { leadId: lead._id });
        const messages = await ctx.runQuery(internal.aiMutations.getMessageCount, { leadId: lead._id });

        await scoreLeadHelper(ctx, lead._id, {
          name: lead.name,
          source: lead.source,
          status: lead.status,
          type: lead.type,
          assignedTo: lead.assignedTo,
          tags: lead.tags,
          lastActivity: lead.lastActivity,
          nextFollowUpDate: lead.nextFollowUpDate,
          createdAt: lead._creationTime,
        }, comments, messages);
        
        scored++;
      } catch (error) {
        console.error(`Failed to score lead ${lead._id}:`, error);
      }
    }

    console.log(`Successfully scored ${scored} leads`);
    return { scored, total: leads.length };
  },
});

export const batchProcessLeads = action({
  args: {
    batchSize: v.optional(v.number()),
    processType: v.union(v.literal("summaries"), v.literal("scores"), v.literal("both")),
  },
  handler: async (ctx, args): Promise<{ processed: number; failed: number; total: number }> => {
    const batchSize = args.batchSize || 50;
    let offset = 0;
    let totalProcessed = 0;
    let totalFailed = 0;
    let hasMore = true;

    console.log(`Starting batch processing: ${args.processType}`);

    while (hasMore) {
      const leads: Array<any> = await ctx.runQuery(internal.aiMutations.getAllLeadsForBatchProcessing, {
        offset,
        limit: batchSize,
      });

      if (leads.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`Processing batch: ${offset} to ${offset + leads.length}`);

      // Process leads in parallel using Promise.allSettled
      const promises = leads.map(async (lead) => {
        try {
          // Get WhatsApp messages
          const whatsappMessages = await ctx.runQuery(internal.aiMutations.getLeadWhatsAppMessages, {
            leadId: lead._id,
          });

          // Get comments
          const comments = await ctx.runQuery(internal.aiMutations.getLeadComments, {
            leadId: lead._id,
          });

          let summary: string | undefined;

          // Generate summary if needed
          if (args.processType === "summaries" || args.processType === "both") {
            const systemPrompt = `You are a CRM assistant. Generate a concise 1-2 sentence summary of this lead for quick prioritization. Focus on: lead quality, urgency, key action needed, and recent engagement. Be brief and actionable.`;

            const leadInfo = {
              name: lead.name,
              subject: lead.subject,
              source: lead.source,
              status: lead.status,
              type: lead.type,
              message: lead.message,
              recentComments: comments.slice(0, 3),
              whatsappActivity: whatsappMessages.length > 0 ? {
                messageCount: whatsappMessages.length,
                recentMessages: whatsappMessages.slice(0, 5).map(m => `${m.direction}: ${m.content.substring(0, 100)}`),
              } : null,
            };

            const prompt = `Summarize this lead in 1-2 sentences:\n\n${JSON.stringify(leadInfo, null, 2)}`;
            const { text } = await generateWithGemini(ctx, systemPrompt, prompt, { useGemma: true });
            
            summary = text;
            const lastActivityHash = `${lead.lastActivity}`;
            await ctx.runMutation(internal.aiMutations.storeSummary, {
              leadId: lead._id,
              summary: text,
              lastActivityHash,
            });
          }

          // Generate score if needed
          if (args.processType === "scores" || args.processType === "both") {
            // If we didn't generate summary above, try to get existing one
            if (!summary) {
              const existingSummary = await ctx.runQuery(internal.aiMutations.getSummary, {
                leadId: lead._id,
                lastActivityHash: `${lead.lastActivity}`,
              });
              summary = existingSummary?.summary;
            }

            const systemPrompt = `You are an AI lead scoring expert for pharmaceutical CRM. Score leads 0-100 based on:
    - Engagement (comments, messages, follow-ups)
    - Recency of activity
    - Lead type and status
    - Source quality
    - WhatsApp conversation quality and engagement
    - AI-generated summary insights
    
    Return JSON with: { "score": <number 0-100>, "tier": "<High|Medium|Low>", "rationale": "<brief explanation>" }`;

            const daysSinceCreated = (Date.now() - lead._creationTime) / (1000 * 60 * 60 * 24);
            const daysSinceActivity = (Date.now() - lead.lastActivity) / (1000 * 60 * 60 * 24);
            
            const whatsappEngagement = whatsappMessages.length > 0 ? {
              totalMessages: whatsappMessages.length,
              inboundCount: whatsappMessages.filter(m => m.direction === "inbound").length,
              outboundCount: whatsappMessages.filter(m => m.direction === "outbound").length,
              recentActivity: whatsappMessages.slice(0, 3).map(m => `${m.direction}: ${m.content.substring(0, 80)}`),
            } : null;

            const leadInfo = {
              source: lead.source,
              status: lead.status,
              type: lead.type,
              isAssigned: !!lead.assignedTo,
              hasFollowUp: !!lead.nextFollowUpDate,
              tagCount: lead.tags?.length || 0,
              commentCount: comments.length,
              messageCount: whatsappMessages.length,
              daysSinceCreated: Math.round(daysSinceCreated),
              daysSinceActivity: Math.round(daysSinceActivity),
              aiSummary: summary,
              whatsappEngagement,
            };

            const prompt = `Score this lead:\n\n${JSON.stringify(leadInfo, null, 2)}`;
            const { text } = await generateWithGemini(ctx, systemPrompt, prompt, { jsonMode: true, useGemma: true });
            
            let parsed;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = { score: 50, tier: "Medium", rationale: "Unable to generate AI score" };
            }

            await ctx.runMutation(internal.aiMutations.storeScore, {
              leadId: lead._id,
              score: parsed.score,
              tier: parsed.tier,
              rationale: parsed.rationale,
            });
          }

          return { success: true, leadId: lead._id };
        } catch (error) {
          console.error(`Failed to process lead ${lead._id}:`, error);
          return { success: false, leadId: lead._id, error };
        }
      });

      const results = await Promise.allSettled(promises);
      
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value.success) {
          totalProcessed++;
        } else {
          totalFailed++;
        }
      });

      offset += leads.length;
      
      // Small delay between batches to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Batch processing complete. Processed: ${totalProcessed}, Failed: ${totalFailed}`);
    return { processed: totalProcessed, failed: totalFailed, total: totalProcessed + totalFailed };
  },
});