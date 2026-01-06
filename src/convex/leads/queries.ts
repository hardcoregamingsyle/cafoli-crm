/**
 * DEPRECATED: This file has been split into modular structure
 * New imports from: ./queries/index.ts
 * 
 * Re-exporting for backwards compatibility
 */

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
} from "./queries/index";