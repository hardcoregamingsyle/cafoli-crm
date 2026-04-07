import { cronJobs } from "convex/server";
import { internal as internalApi } from "./_generated/api";

const internal = internalApi as any;

const crons = cronJobs();

// Fetch leads from Pharmavends every 5 minutes
crons.interval(
  "fetch_pharmavends_leads",
  { minutes: 5 },
  internal.pharmavends.fetchPharmavendsLeads,
  {}
);

// Process campaign executions every 5 minutes
crons.interval(
  "process_campaign_executions",
  { minutes: 5 },
  internal.campaignExecutor.processCampaignExecutions,
  {}
);

// Auto-geocode leads every 5 minutes
crons.interval(
  "auto_geocode_leads",
  { minutes: 5 },
  internal.geocoding.batchGeocodeLeads,
  {}
);

// Check for questionnaire reminders every hour
crons.interval(
  "questionnaire_reminders",
  { minutes: 60 },
  internal.questionnaire.processQuestionnaireReminders,
  {}
);

// Daily maintenance at 1:30 AM IST (8 PM UTC): mark cold callers, cleanup bulk contacts, cleanup logs, cleanup sessions
crons.cron(
  "daily_maintenance",
  "0 20 * * *",
  internal.bulkMessaging.cleanupOldContacts,
  {}
);

crons.cron(
  "daily_mark_cold_callers",
  "5 20 * * *",
  internal.coldCallerLeads.markColdCallerLeads,
  {}
);

crons.cron(
  "daily_cleanup_logs",
  "10 20 * * *",
  internal.activityLogs.cleanupOldLogs,
  {}
);

crons.cron(
  "daily_cleanup_sessions",
  "15 20 * * *",
  internal.activeChatSessions.cleanupStaleSessionsInternal,
  {}
);

crons.cron(
  "daily_cleanup_transient",
  "20 20 * * *",
  internal.migrations.cleanupTransientData,
  {}
);

// Allocate cold caller leads daily at 9 AM IST (3:30 AM UTC)
crons.cron(
  "allocate_cold_caller_leads",
  "30 3 * * *",
  internal.coldCallerLeads.allocateColdCallerLeads,
  {}
);

// Score leads + regenerate summaries daily at 2 AM IST (8:30 PM UTC previous day)
crons.cron(
  "score_leads_daily",
  "30 20 * * *",
  internal.ai.scoreLeadsJob,
  {}
);

crons.cron(
  "regenerate_summaries_and_scores",
  "0 21 * * *",
  internal.ai.dailySummaryAndScoreRegeneration,
  {}
);

// Daily report at 7 PM IST (1:30 PM UTC)
crons.cron(
  "daily_report_email",
  "30 13 * * *",
  internal.reportPdfGenerator.sendScheduledReports,
  { reportType: "daily" }
);

// Weekly report every Sunday at 12 AM IST (Saturday 6:30 PM UTC)
crons.cron(
  "weekly_report_email",
  "30 18 * * 6",
  internal.reportPdfGenerator.sendScheduledReports,
  { reportType: "weekly" }
);

// Monthly report on 1st of every month at 6:30 PM UTC
crons.cron(
  "monthly_report_email",
  "30 18 1 * *",
  internal.reportPdfGenerator.sendScheduledReports,
  { reportType: "monthly" }
);

// Quarterly report on 1st of Jan, Apr, Jul, Oct
crons.cron(
  "quarterly_report_email",
  "30 18 1 1,4,7,10 *",
  internal.reportPdfGenerator.sendScheduledReports,
  { reportType: "quarterly" }
);

// Yearly report on January 1st
crons.cron(
  "yearly_report_email",
  "30 18 1 1 *",
  internal.reportPdfGenerator.sendScheduledReports,
  { reportType: "yearly" }
);

export default crons;