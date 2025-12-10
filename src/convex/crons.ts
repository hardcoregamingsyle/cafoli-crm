import { cronJobs } from "convex/server";
// import { internal } from "./_generated/api";

const crons = cronJobs();

// Fetch Pharmavends leads every 5 minutes
// Temporarily disabled until types regenerate
// crons.interval(
//   "fetch_pharmavends_leads",
//   { minutes: 5 },
//   internal.pharmavends.fetchPharmavendsLeads,
//   {}
// );

export default crons;
