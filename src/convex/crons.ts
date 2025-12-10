import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Temporarily disabled until pharmavends module is properly set up
// crons.interval(
//   "fetch_pharmavends_leads",
//   { minutes: 5 },
//   internal.pharmavends.fetchPharmavendsLeads,
//   {}
// );

export default crons;