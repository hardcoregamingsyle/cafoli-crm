import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router";
import { Id } from "@/convex/_generated/dataModel";

export function useLeadsPageState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const path = location.pathname;
  
  // Determine filter based on path
  const filter = path === "/my_leads" ? "mine" : path === "/all_leads" ? "all" : "unassigned";
  const title = path === "/my_leads" ? "My Leads" : path === "/all_leads" ? "All Leads" : "Unassigned Leads";

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [leadToAssign, setLeadToAssign] = useState<Id<"leads"> | null>(null);
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAssignedTo, setSelectedAssignedTo] = useState<string[]>([]);
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false);
  const [whatsAppLeadId, setWhatsAppLeadId] = useState<Id<"leads"> | null>(null);
  const [filterSidebarOpen, setFilterSidebarOpen] = useState(false);
  const [viewColdCallerLeads, setViewColdCallerLeads] = useState(false);
  const [viewIrrelevantLeads, setViewIrrelevantLeads] = useState(false);
  const [targetUserId, setTargetUserId] = useState<Id<"users"> | null>(null);

  // Reset view states when path changes
  useEffect(() => {
    setViewColdCallerLeads(false);
    setViewIrrelevantLeads(false);
  }, [path]);

  return {
    filter,
    title,
    search,
    setSearch,
    sortBy,
    setSortBy,
    selectedLeadId,
    setSelectedLeadId,
    isCreateOpen,
    setIsCreateOpen,
    isAssignDialogOpen,
    setIsAssignDialogOpen,
    leadToAssign,
    setLeadToAssign,
    followUpDate,
    setFollowUpDate,
    selectedStatuses,
    setSelectedStatuses,
    selectedSources,
    setSelectedSources,
    selectedTags,
    setSelectedTags,
    selectedAssignedTo,
    setSelectedAssignedTo,
    whatsAppDialogOpen,
    setWhatsAppDialogOpen,
    whatsAppLeadId,
    setWhatsAppLeadId,
    filterSidebarOpen,
    setFilterSidebarOpen,
    viewColdCallerLeads,
    setViewColdCallerLeads,
    viewIrrelevantLeads,
    setViewIrrelevantLeads,
    targetUserId,
    setTargetUserId,
    searchParams,
    setSearchParams,
  };
}
