// DEPRECATED: This file has been refactored into src/convex/leads/queries/*
// Please import from api.leads.queries instead of api.leadQueries
// This file is kept temporarily for backwards compatibility

// Re-export from new location
export { 
  getPaginatedLeads,
  getOverdueLeads,
  getCriticalOverdueLeads,
  getColdOverdueLeads,
  getLeads,
  getLead,
  getLeadsWithUnreadCounts,
  getMyLeadsWithoutFollowUp,
  getUpcomingFollowUps,
  getComments,
  getUniqueSources,
  getAllLeadsForExport,
  getNextDownloadNumber,
} from "./leads/queries/index";