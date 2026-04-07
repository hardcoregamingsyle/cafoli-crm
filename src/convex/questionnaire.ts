import { internalMutation, internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const QUESTIONNAIRE_MESSAGE = `Thank you for contacting us 🙏

To assist you better, kindly share the following details:

1️⃣ Agency / Firm Name
2️⃣ Marketing Area / Location
3️⃣ Business Type (Wholesaler / Retailer / Doctor / Hospital / Distributor)
4️⃣ Preferred Time for Call
5️⃣ Alternate Contact Number (if any)
6️⃣ Email ID

Once we receive your details, our team will connect with you shortly 👍`;

export const QUESTIONNAIRE_REMINDER = `Gentle reminder 😊

Kindly share your details so we can proceed further and provide you complete information.
Looking forward to your response.`;

// Mark questionnaire as sent for a lead
export const markQuestionnaireSent = internalMutation({
  args: {
    leadId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      questionnaireSentAt: Date.now(),
      questionnaireAnswered: false,
    });
  },
});

// Mark questionnaire as answered and store extracted data
export const markQuestionnaireAnswered = internalMutation({
  args: {
    leadId: v.id("leads"),
    agencyName: v.optional(v.string()),
    marketingArea: v.optional(v.string()),
    businessType: v.optional(v.string()),
    preferredCallTime: v.optional(v.string()),
    altMobile: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: any = {
      questionnaireAnswered: true,
    };
    if (args.agencyName) patch.agencyName = args.agencyName;
    if (args.marketingArea) patch.station = args.marketingArea; // store in station field
    if (args.businessType) patch.subject = args.businessType; // store in subject field
    if (args.altMobile) patch.altMobile = args.altMobile;
    if (args.email) patch.email = args.email;
    // Store preferredCallTime in message field if not already set
    if (args.preferredCallTime) {
      const lead = await ctx.db.get(args.leadId);
      if (lead && !lead.message) {
        patch.message = `Preferred call time: ${args.preferredCallTime}`;
      }
    }
    await ctx.db.patch(args.leadId, patch);
  },
});

// Get leads that need questionnaire reminder (sent 6+ hours ago, not answered, no reminder sent yet)
export const getLeadsNeedingReminder = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_questionnaire_sent", q => q.lt("questionnaireSentAt", sixHoursAgo))
      .take(50);
    
    return leads.filter(l => 
      l.questionnaireSentAt && 
      !l.questionnaireAnswered && 
      !l.questionnaireReminderSentAt
    );
  },
});

// Send questionnaire reminder to a lead
export const sendQuestionnaireReminder = internalAction({
  args: {
    leadId: v.id("leads"),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runAction(internal.whatsapp.internal.sendMessage, {
        leadId: args.leadId,
        phoneNumber: args.phoneNumber,
        message: QUESTIONNAIRE_REMINDER,
      });
      await ctx.runMutation(internal.questionnaire.markReminderSent, {
        leadId: args.leadId,
      });
    } catch (e) {
      console.error(`[QUESTIONNAIRE] Failed to send reminder to lead ${args.leadId}:`, e);
    }
  },
});

export const markReminderSent = internalMutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      questionnaireReminderSentAt: Date.now(),
    });
  },
});

// Parse questionnaire answers from a message using Gemini and store them
export const parseAndStoreQuestionnaireAnswers = internalAction({
  args: {
    leadId: v.id("leads"),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Simple heuristic: if message contains numbers (1, 2, 3...) or keywords, try to parse
      const msg = args.message.toLowerCase();
      const hasQuestionnaireContent = 
        /agency|firm|wholesaler|retailer|doctor|hospital|distributor|marketing area|location|email|alternate|contact|call time/i.test(args.message) ||
        /[1-6][.)]\s*\S/.test(args.message);
      
      if (!hasQuestionnaireContent) return;

      // Use Gemini to extract structured data
      const { generateWithGemini, extractJsonFromMarkdown } = await import("./lib/gemini");
      const systemPrompt = `Extract questionnaire answers from this WhatsApp message. The questionnaire asked for:
1. Agency/Firm Name
2. Marketing Area/Location  
3. Business Type (Wholesaler/Retailer/Doctor/Hospital/Distributor)
4. Preferred Time for Call
5. Alternate Contact Number
6. Email ID

Return ONLY a JSON object with these fields (use null if not found):
{ "agencyName": "...", "marketingArea": "...", "businessType": "...", "preferredCallTime": "...", "altMobile": "...", "email": "..." }`;

      const { text } = await generateWithGemini(ctx, systemPrompt, `Message: "${args.message}"`, { jsonMode: true });
      const jsonStr = extractJsonFromMarkdown(text);
      const parsed = JSON.parse(jsonStr);

      // Only store if at least one field was extracted
      const hasData = parsed.agencyName || parsed.marketingArea || parsed.businessType || 
                      parsed.preferredCallTime || parsed.altMobile || parsed.email;
      
      if (hasData) {
        await ctx.runMutation(internal.questionnaire.markQuestionnaireAnswered, {
          leadId: args.leadId,
          agencyName: parsed.agencyName || undefined,
          marketingArea: parsed.marketingArea || undefined,
          businessType: parsed.businessType || undefined,
          preferredCallTime: parsed.preferredCallTime || undefined,
          altMobile: parsed.altMobile || undefined,
          email: parsed.email || undefined,
        });
        console.log(`[QUESTIONNAIRE] Stored answers for lead ${args.leadId}`);
      }
    } catch (e) {
      console.error(`[QUESTIONNAIRE] Failed to parse answers for lead ${args.leadId}:`, e);
    }
  },
});

// Cron job: check for leads needing reminders
export const processQuestionnaireReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.runQuery(internal.questionnaire.getLeadsNeedingReminder, {});
    
    for (const lead of leads) {
      if (!lead.mobile) continue;
      await ctx.runAction(internal.questionnaire.sendQuestionnaireReminder, {
        leadId: lead._id,
        phoneNumber: lead.mobile,
      });
    }
    
    console.log(`[QUESTIONNAIRE] Processed reminders for ${leads.length} leads`);
  },
});