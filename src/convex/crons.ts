import { cronJobs } from "convex/server";
import type { internal as InternalType } from "./_generated/api";

// Import internal with type bypass to avoid circular type instantiation
const internal = require("./_generated/api").internal as any;

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

export default crons;