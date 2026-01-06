import AppLayout from "@/components/AppLayout";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useInView } from "react-intersection-observer";
import LeadDetails from "@/components/LeadDetails";
import { AssignLeadDialog } from "@/components/leads/AssignLeadDialog";
import { LeadsFilterSidebar } from "@/components/leads/LeadsFilterSidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";
import { useLeadsPageState } from "@/hooks/useLeadsPageState";
import { LeadsToolbar } from "@/components/leads/LeadsToolbar";
import { ActiveFiltersDisplay } from "@/components/leads/ActiveFiltersDisplay";
import { LeadsListPanel } from "@/components/leads/LeadsListPanel";

export default function Leads() {
  const { user } = useAuth();
  const state = useLeadsPageState();

  const allTags = useQuery(api.tags.getAllTags) || [];
  const uniqueSources = useQuery(api.leads.queries.getUniqueSources) || [];
  const allUsers = useQuery(api.users.getAllUsers) || [];

  const assignLead = useMutation(api.leads.standard.assignLead);
  const unassignLead = useMutation(api.leads.standard.unassignLead);
  const unassignIdle = useMutation(api.coldCallerLeads.unassignColdCallerLeadsWithoutFollowUp);

  const handleLeadSelect = (id: Id<"leads">) => {
    state.setSelectedLeadId(id);
  };

  const handleAssignToSelf = async (leadId: Id<"leads">) => {
    if (!user) return;
    state.setLeadToAssign(leadId);
    state.setFollowUpDate("");
    state.setIsAssignDialogOpen(true);
  };

  const handleUnassign = async (leadId: Id<"leads">) => {
    if (!user) return;
    if (!confirm("Are you sure you want to unassign this lead? It will return to the unassigned pool.")) return;
    try {
      await unassignLead({ leadId, userId: user._id });
      toast.success("Lead unassigned successfully");
    } catch (error) {
      toast.error("Failed to unassign lead");
      console.error(error);
    }
  };

  const handleAssignToUser = async (leadId: Id<"leads">, userId: Id<"users">) => {
    if (!user) return;
    state.setLeadToAssign(leadId);
    state.setFollowUpDate("");
    state.setIsAssignDialogOpen(true);
    state.setTargetUserId(userId);
  };

  const handleUnassignIdle = async () => {
    if (!user) return;
    if (!confirm("Are you sure you want to unassign all cold caller leads that have no follow-up date set? This will return them to the unassigned pool.")) return;
    try {
      const count = await unassignIdle({ adminId: user._id });
      toast.success(`Unassigned ${count} idle leads`);
    } catch (e) {
      toast.error("Failed to unassign leads");
      console.error(e);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    return now.toISOString().slice(0, 16);
  };

  const getMaxDateTime = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 31);
    return maxDate.toISOString().slice(0, 16);
  };

  const isAdmin = user?.role === "admin";
  const availableStatuses = ["Cold", "Hot", "Mature"];

  const ITEMS_PER_PAGE = 50;
  const [paginationOpts, setPaginationOpts] = useState({ numItems: ITEMS_PER_PAGE, cursor: null as string | null });
  
  const paginatedResult = useQuery(
    api.leads.queries.getPaginatedLeads,
    user ? {
      userId: user._id,
      filter: state.viewIrrelevantLeads ? "irrelevant" : state.viewColdCallerLeads ? "cold_caller" : state.filter,
      search: state.search || undefined,
      statuses: state.selectedStatuses.length > 0 ? state.selectedStatuses : undefined,
      sources: state.selectedSources.length > 0 ? state.selectedSources : undefined,
      tags: state.selectedTags.length > 0 ? state.selectedTags.map(t => t as Id<"tags">) : undefined,
      assignedToUsers: state.selectedAssignedTo.length > 0 ? state.selectedAssignedTo.map(u => u as Id<"users">) : undefined,
      sortBy: state.sortBy || undefined,
      paginationOpts,
    } : "skip"
  );

  const [allLoadedLeads, setAllLoadedLeads] = useState<Doc<"leads">[]>([]);

  // Reset loaded leads when filters change
  useMemo(() => {
    setAllLoadedLeads([]);
    setPaginationOpts({ numItems: ITEMS_PER_PAGE, cursor: null });
  }, [state.filter, state.search, state.selectedStatuses, state.selectedSources, state.selectedTags, state.selectedAssignedTo, state.sortBy, state.viewColdCallerLeads, state.viewIrrelevantLeads]);

  // Append new leads when pagination result changes
  useMemo(() => {
    if (paginatedResult?.page) {
      setAllLoadedLeads(prev => {
        if (paginationOpts.cursor === null) {
          return paginatedResult.page;
        }
        const existingIds = new Set(prev.map(l => l._id));
        const newLeads = paginatedResult.page.filter(l => !existingIds.has(l._id));
        return [...prev, ...newLeads];
      });
    }
  }, [paginatedResult, paginationOpts.cursor]);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
  });

  // Load more when scrolling to bottom
  useMemo(() => {
    if (inView && paginatedResult && !paginatedResult.isDone && paginatedResult.continueCursor) {
      setPaginationOpts({ numItems: ITEMS_PER_PAGE, cursor: paginatedResult.continueCursor });
    }
  }, [inView, paginatedResult]);

  const filteredLeads = allLoadedLeads || [];

  const handleOpenWhatsApp = (leadId: Id<"leads">) => {
    state.setWhatsAppLeadId(leadId);
    state.setWhatsAppDialogOpen(true);
  };

  const whatsAppLead = state.whatsAppLeadId && filteredLeads ? filteredLeads.find(l => l._id === state.whatsAppLeadId) : null;

  const activeFilterCount = state.selectedStatuses.length + state.selectedSources.length + 
                           state.selectedTags.length + state.selectedAssignedTo.length;

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col gap-4">
        <LeadsToolbar
          title={state.title}
          viewIrrelevantLeads={state.viewIrrelevantLeads}
          viewColdCallerLeads={state.viewColdCallerLeads}
          isAdmin={isAdmin}
          filter={state.filter}
          search={state.search}
          setSearch={state.setSearch}
          sortBy={state.sortBy}
          setSortBy={state.setSortBy}
          setFilterSidebarOpen={state.setFilterSidebarOpen}
          activeFilterCount={activeFilterCount}
          isCreateOpen={state.isCreateOpen}
          setIsCreateOpen={state.setIsCreateOpen}
          userId={user?._id}
          onUnassignIdle={handleUnassignIdle}
          onToggleColdCallerView={() => {
            if (!state.viewColdCallerLeads) state.setViewIrrelevantLeads(false);
            state.setViewColdCallerLeads(!state.viewColdCallerLeads);
          }}
          onToggleIrrelevantView={() => {
            if (!state.viewIrrelevantLeads) state.setViewColdCallerLeads(false);
            state.setViewIrrelevantLeads(!state.viewIrrelevantLeads);
          }}
        />

        <ActiveFiltersDisplay
          selectedStatuses={state.selectedStatuses}
          setSelectedStatuses={state.setSelectedStatuses}
          selectedSources={state.selectedSources}
          setSelectedSources={state.setSelectedSources}
          selectedTags={state.selectedTags}
          setSelectedTags={state.setSelectedTags}
          selectedAssignedTo={state.selectedAssignedTo}
          setSelectedAssignedTo={state.setSelectedAssignedTo}
          allTags={allTags}
          allUsers={allUsers}
        />

        <div className="flex-1 flex gap-4 min-h-0">
          <LeadsListPanel
            leads={filteredLeads}
            selectedLeadId={state.selectedLeadId}
            filter={state.filter}
            isAdmin={isAdmin}
            allUsers={allUsers}
            onSelect={handleLeadSelect}
            onAssignToSelf={handleAssignToSelf}
            onAssignToUser={handleAssignToUser}
            onUnassign={handleUnassign}
            onOpenWhatsApp={handleOpenWhatsApp}
            loadMoreRef={loadMoreRef}
            isLoadingMore={!!paginatedResult && !paginatedResult.isDone}
            isDone={!!paginatedResult?.isDone}
          />

          {state.selectedLeadId ? (
            <div className="flex-1 min-w-0 h-full">
              <LeadDetails 
                leadId={state.selectedLeadId} 
                onClose={() => {
                  const newParams = new URLSearchParams(state.searchParams);
                  newParams.delete("leadId");
                  state.setSearchParams(newParams);
                  state.setSelectedLeadId(null);
                }} 
              />
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center border rounded-lg bg-muted/10 text-muted-foreground">
              Select a lead to view details
            </div>
          )}
        </div>

        <LeadsFilterSidebar
          open={state.filterSidebarOpen}
          onOpenChange={state.setFilterSidebarOpen}
          selectedStatuses={state.selectedStatuses}
          setSelectedStatuses={state.setSelectedStatuses}
          selectedSources={state.selectedSources}
          setSelectedSources={state.setSelectedSources}
          selectedTags={state.selectedTags}
          setSelectedTags={state.setSelectedTags}
          selectedAssignedTo={state.selectedAssignedTo}
          setSelectedAssignedTo={state.setSelectedAssignedTo}
          allTags={allTags}
          uniqueSources={uniqueSources}
          allUsers={allUsers}
          isAdmin={isAdmin}
          availableStatuses={availableStatuses}
        />

        <Dialog open={state.whatsAppDialogOpen} onOpenChange={state.setWhatsAppDialogOpen}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
            <DialogHeader className="px-6 py-4 border-b">
              <DialogTitle>WhatsApp Chat - {whatsAppLead?.name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              {state.whatsAppLeadId && whatsAppLead && (
                <ChatWindow 
                  selectedLeadId={state.whatsAppLeadId} 
                  selectedLead={whatsAppLead}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        <AssignLeadDialog
          open={state.isAssignDialogOpen}
          onOpenChange={state.setIsAssignDialogOpen}
          onConfirm={async () => {
            if (!user || !state.leadToAssign || !state.followUpDate) return;
            try {
              await assignLead({
                leadId: state.leadToAssign,
                userId: state.targetUserId || user._id,
                adminId: user._id,
                nextFollowUpDate: new Date(state.followUpDate).getTime(),
              });
              toast.success("Lead assigned successfully");
              state.setIsAssignDialogOpen(false);
              state.setLeadToAssign(null);
              state.setFollowUpDate("");
              state.setTargetUserId(null);
            } catch (error) {
              toast.error("Failed to assign lead");
            }
          }}
          onCancel={() => {
            state.setIsAssignDialogOpen(false);
            state.setLeadToAssign(null);
            state.setFollowUpDate("");
            state.setTargetUserId(null);
          }}
          followUpDate={state.followUpDate}
          setFollowUpDate={state.setFollowUpDate}
          minDateTime={getMinDateTime()}
          maxDateTime={getMaxDateTime()}
        />
      </div>
    </AppLayout>
  );
}