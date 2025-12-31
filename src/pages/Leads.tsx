import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery, usePaginatedQuery, useAction } from "convex/react";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useInView } from "react-intersection-observer";
import LeadDetails from "@/components/LeadDetails";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { LeadCard } from "@/components/LeadCard";
import { OverdueLeadsDialog } from "@/components/leads/OverdueLeadsDialog";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { AssignLeadDialog } from "@/components/leads/AssignLeadDialog";
import { LeadsFilterBar } from "@/components/leads/LeadsFilterBar";

export default function Leads() {
  const location = useLocation();
  const path = location.pathname;
  const { user } = useAuth();
  
  // Determine filter based on path
  const filter = path === "/my_leads" ? "mine" : path === "/all_leads" ? "all" : "unassigned";
  const title = path === "/my_leads" ? "My Leads" : path === "/all_leads" ? "All Leads" : "Unassigned Leads";

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewIrrelevant, setViewIrrelevant] = useState(false);
  
  // New unified filter states
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAssignedTo, setSelectedAssignedTo] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>("newest");

  const allTags = useQuery(api.tags.getAllTags) || [];
  const uniqueSources = useQuery(api.leads.getUniqueSources) || [];
  const allUsers = useQuery(api.users.getAllUsers, user ? { userId: user._id } : "skip") || [];

  const manualSync = useAction(api.pharmavends.manualSyncPharmavends);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await manualSync();
      toast.success("Sync started in background");
    } catch (error) {
      toast.error("Failed to start sync");
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { 
    results: leads, 
    status, 
    loadMore, 
  } = usePaginatedQuery(
    api.leads.getPaginatedLeads, 
    { 
      filter: viewIrrelevant ? "irrelevant" : filter, 
      userId: user?._id,
      search: debouncedSearch || undefined,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      sources: selectedSources.length > 0 ? selectedSources : undefined,
      tags: selectedTags.length > 0 ? selectedTags as Id<"tags">[] : undefined,
      assignedToUsers: selectedAssignedTo.length > 0 ? selectedAssignedTo as Id<"users">[] : undefined,
      sortBy: sortBy,
    }, 
    { initialNumItems: 20 }
  );

  // Overdue Leads Popup Logic
  const overdueLeads = useQuery(api.leads.getOverdueLeads, filter === "mine" && user ? { userId: user._id } : "skip");
  const [isOverduePopupOpen, setIsOverduePopupOpen] = useState(false);
  const [hasShownOverduePopup, setHasShownOverduePopup] = useState(false);

  useEffect(() => {
    if (filter === "mine" && overdueLeads && overdueLeads.length > 0 && !hasShownOverduePopup) {
      setIsOverduePopupOpen(true);
      setHasShownOverduePopup(true);
    }
  }, [filter, overdueLeads, hasShownOverduePopup]);

  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && status === "CanLoadMore") {
      loadMore(20);
    }
  }, [inView, status, loadMore]);

  const assignLead = useMutation(api.leads.assignLead);

  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [leadToAssign, setLeadToAssign] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState<string>("");

  const handleAssignToSelf = async (leadId: string) => {
    if (!user) return;
    setLeadToAssign(leadId);
    setFollowUpDate("");
    setIsAssignDialogOpen(true);
  };

  const confirmAssignToSelf = async () => {
    if (!user || !leadToAssign) return;
    
    if (!followUpDate) {
      toast.error("Setting follow-up date is compulsory");
      return;
    }
    
    const followUpTimestamp = new Date(followUpDate).getTime();
    
    try {
      await assignLead({ 
        leadId: leadToAssign as any, 
        userId: user._id, 
        adminId: user._id,
        nextFollowUpDate: followUpTimestamp
      });
      toast.success("Lead assigned to you with follow-up date set");
      setIsAssignDialogOpen(false);
      setLeadToAssign(null);
      setFollowUpDate("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign lead");
    }
  };

  const handleAssignToUser = async (leadId: string, userId: string) => {
    if (!user) return;
    try {
      await assignLead({ leadId: leadId as any, userId: userId as any, adminId: user._id });
      toast.success("Lead assigned successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign lead");
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
  const isUnassignedView = filter === "unassigned";

  const availableStatuses = ["Cold", "Hot", "Mature"];

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)]">
        {/* Overdue Leads Popup */}
        <OverdueLeadsDialog 
          open={isOverduePopupOpen} 
          onOpenChange={setIsOverduePopupOpen} 
          leads={overdueLeads} 
          onSelectLead={(id) => {
            setSelectedLeadId(id);
            setIsOverduePopupOpen(false);
          }} 
        />

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {viewIrrelevant ? "Irrelevant Leads" : title}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">Manage your leads and communications.</p>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button 
                variant="outline" 
                onClick={handleSync}
                disabled={isSyncing}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
                Sync Leads
              </Button>

              <Button 
                variant={viewIrrelevant ? "secondary" : "outline"}
                onClick={() => setViewIrrelevant(!viewIrrelevant)}
              >
                {viewIrrelevant ? "Show Active Leads" : "Show Irrelevant Leads"}
              </Button>

              {user && (
                <CreateLeadDialog 
                  open={isCreateOpen} 
                  onOpenChange={setIsCreateOpen} 
                  userId={user._id} 
                />
              )}

              {/* Follow-up Date Assignment Dialog */}
              <AssignLeadDialog 
                open={isAssignDialogOpen} 
                onOpenChange={setIsAssignDialogOpen} 
                onConfirm={confirmAssignToSelf}
                onCancel={() => {
                  setIsAssignDialogOpen(false);
                  setLeadToAssign(null);
                  setFollowUpDate("");
                }}
                followUpDate={followUpDate}
                setFollowUpDate={setFollowUpDate}
                minDateTime={getMinDateTime()}
                maxDateTime={getMaxDateTime()}
              />
            </div>
          </div>

          {/* Unified Filters Row */}
          <LeadsFilterBar 
            selectedStatuses={selectedStatuses}
            setSelectedStatuses={setSelectedStatuses}
            selectedSources={selectedSources}
            setSelectedSources={setSelectedSources}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            selectedAssignedTo={selectedAssignedTo}
            setSelectedAssignedTo={setSelectedAssignedTo}
            allTags={allTags}
            uniqueSources={uniqueSources}
            allUsers={allUsers}
            isAdmin={isAdmin}
            availableStatuses={availableStatuses}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6 flex-1 overflow-hidden">
          {/* Lead List */}
          <div className={`w-full md:w-1/3 lg:w-2/5 flex flex-col gap-4 ${selectedLeadId ? 'hidden md:flex' : 'flex'}`}>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {leads?.map((lead: Doc<"leads">) => (
                <LeadCard
                  key={lead._id}
                  lead={lead}
                  isSelected={selectedLeadId === lead._id}
                  isUnassignedView={isUnassignedView}
                  viewIrrelevant={viewIrrelevant}
                  isAdmin={isAdmin}
                  allUsers={allUsers}
                  onSelect={setSelectedLeadId}
                  onAssignToSelf={(id) => handleAssignToSelf(id)}
                  onAssignToUser={(leadId, userId) => handleAssignToUser(leadId, userId)}
                />
              ))}
              
              {/* Loading indicator and infinite scroll trigger */}
              <div ref={ref} className="py-4 flex justify-center">
                {status === "LoadingMore" && (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                )}
                {status === "Exhausted" && leads?.length > 0 && (
                  <span className="text-xs text-muted-foreground">No more leads</span>
                )}
                {status === "LoadingFirstPage" && (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                )}
                {status === "Exhausted" && leads?.length === 0 && (
                  <span className="text-sm text-muted-foreground">No leads found</span>
                )}
              </div>
            </div>
          </div>

          {/* Lead Details */}
          {selectedLeadId ? (
            <LeadDetails 
              leadId={selectedLeadId} 
              onClose={() => setSelectedLeadId(null)} 
            />
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
              Select a lead to view details
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}