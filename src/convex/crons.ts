import { cronJobs } from "convex/server";
import { internal as internalApi } from "./_generated/api";

// Import internal with type bypass to avoid circular type instantiation
const internal = internalApi as any;

const crons = cronJobs();

// Fetch leads from Google Sheet every 5 minutes
crons.interval(
  "fetch_pharmavends_leads",
  { minutes: 5 },
  internal.pharmavends.fetchPharmavendsLeads,
  {}
);

// Mark cold caller leads every hour
crons.interval(
  "mark_cold_caller_leads",
  { minutes: 60 },
  internal.coldCallerLeads.markColdCallerLeads,
  {}
);

// Allocate cold caller leads daily at 9 AM IST (3:30 AM UTC)
crons.cron(
  "allocate_cold_caller_leads",
  "30 3 * * *",
  internal.coldCallerLeads.allocateColdCallerLeads,
  {}
);

// Process campaign executions every 5 minutes
crons.interval(
  "process_campaign_executions",
  { minutes: 5 },
  internal.campaignExecutor.processCampaignExecutions,
  {}
);

// Daily report at 7 PM IST (1:30 PM UTC same day)
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

// Monthly report on 2nd of every month at 12 AM IST (1st 6:30 PM UTC)
crons.cron(
  "monthly_report_email",
  "30 18 1 * *",
  internal.reportPdfGenerator.sendScheduledReports,
  { reportType: "monthly" }
);

// Quarterly report on 2nd of Jan, Apr, Jul, Oct at 12 AM IST
crons.cron(
  "quarterly_report_email",
  "30 18 1 1,4,7,10 *",
  internal.reportPdfGenerator.sendScheduledReports,
  { reportType: "quarterly" }
);

// Yearly report on January 2nd at 12 AM IST
crons.cron(
  "yearly_report_email",
  "30 18 1 1 *",
  internal.reportPdfGenerator.sendScheduledReports,
  { reportType: "yearly" }
);

// Score leads daily at 2 AM IST (8:30 PM UTC previous day)
crons.cron(
  "score_leads_daily",
  "30 20 * * *",
  internal.ai.scoreLeadsJob,
  {}
);

// Regenerate summaries and scores daily at 12 AM IST (6:30 PM UTC previous day)
crons.cron(
  "regenerate_summaries_and_scores",
  "30 18 * * *",
  internal.ai.dailySummaryAndScoreRegeneration,
  {}
);

export default crons;