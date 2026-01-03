import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useSearchParams } from "react-router";
import { Plus, Search, Loader2, RefreshCw, ArrowUpDown, Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { useInView } from "react-intersection-observer";
import LeadDetails from "@/components/LeadDetails";
import { LeadCard } from "@/components/LeadCard";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { AssignLeadDialog } from "@/components/leads/AssignLeadDialog";
import { LeadsFilterSidebar } from "@/components/leads/LeadsFilterSidebar";
import { MandatoryFollowUpPopup } from "@/components/MandatoryFollowUpPopup";
import { LeadReminders } from "@/components/LeadReminders";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";

export default function Leads() {
  const { user } = useAuth();
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

  const allTags = useQuery(api.tags.getAllTags) || [];
  const uniqueSources = useQuery(api.leadQueries.getUniqueSources) || [];
  const allUsers = useQuery(api.users.getAllUsers, user ? { userId: user._id } : "skip") || [];

  const assignLead = useMutation(api.leads.standard.assignLead);
  const unassignLead = useMutation(api.leads.standard.unassignLead);
  const unassignIdle = useMutation(api.coldCallerLeads.unassignColdCallerLeadsWithoutFollowUp);

  const handleLeadSelect = (id: Id<"leads">) => {
    setSelectedLeadId(id);
  };

  const handleAssignToSelf = async (leadId: Id<"leads">) => {
    if (!user) return;
    setLeadToAssign(leadId);
    setFollowUpDate("");
    setIsAssignDialogOpen(true);
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
    await assignLead({ leadId, userId, adminId: user._id });
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

  // Use client-side filtering for now
  const ITEMS_PER_PAGE = 50;
  const [paginationOpts, setPaginationOpts] = useState({ numItems: ITEMS_PER_PAGE, cursor: null as string | null });
  
  const paginatedResult = useQuery(
    api.leadQueries.getPaginatedLeads,
    user ? {
      userId: user._id,
      filter: viewColdCallerLeads ? "cold_caller" : filter,
      search: search || undefined,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      sources: selectedSources.length > 0 ? selectedSources : undefined,
      tags: selectedTags.length > 0 ? selectedTags.map(t => t as Id<"tags">) : undefined,
      assignedToUsers: selectedAssignedTo.length > 0 ? selectedAssignedTo.map(u => u as Id<"users">) : undefined,
      sortBy: sortBy || undefined,
      paginationOpts,
    } : "skip"
  );

  const [allLoadedLeads, setAllLoadedLeads] = useState<Doc<"leads">[]>([]);

  // Reset loaded leads when filters change
  useMemo(() => {
    setAllLoadedLeads([]);
    setPaginationOpts({ numItems: ITEMS_PER_PAGE, cursor: null });
  }, [filter, search, selectedStatuses, selectedSources, selectedTags, selectedAssignedTo, sortBy, viewColdCallerLeads]);

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

  const sortedLeads = allLoadedLeads;

  const filteredLeads = sortedLeads || [];

  const handleOpenWhatsApp = (leadId: Id<"leads">) => {
    setWhatsAppLeadId(leadId);
    setWhatsAppDialogOpen(true);
  };

  const whatsAppLead = whatsAppLeadId && filteredLeads ? filteredLeads.find(l => l._id === whatsAppLeadId) : null;

  return (
    <AppLayout>
      {/* Show reminders first, then mandatory follow-up popup */}
      {filter === "mine" && <LeadReminders />}
      {filter === "mine" && <MandatoryFollowUpPopup />}
      
      <div className="h-[calc(100vh-4rem)] flex flex-col gap-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {viewColdCallerLeads ? "Cold Caller Leads" : title}
            </h1>
            <p className="text-muted-foreground">
              Manage and track your leads
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            {isAdmin && filter === "all" && (
              <>
                {viewColdCallerLeads && (
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (!user) return;
                      if (!confirm("Are you sure you want to unassign all cold caller leads that have no follow-up date set? This will return them to the unassigned pool.")) return;
                      try {
                        const count = await unassignIdle({ adminId: user._id });
                        toast.success(`Unassigned ${count} idle leads`);
                      } catch (e) {
                        toast.error("Failed to unassign leads");
                        console.error(e);
                      }
                    }}
                  >
                    Unassign Idle Leads
                  </Button>
                )}
                <Button
                  variant={viewColdCallerLeads ? "default" : "outline"}
                  onClick={() => setViewColdCallerLeads(!viewColdCallerLeads)}
                  className="gap-2"
                >
                  {viewColdCallerLeads ? "Show All Leads" : "Show Cold Caller Leads"}
                </Button>
              </>
            )}
            <CreateLeadDialog 
              open={isCreateOpen} 
              onOpenChange={setIsCreateOpen} 
              userId={user?._id as Id<"users">} 
            />
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone, company, subject, or message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          
          <div className="flex gap-2">
            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px] md:w-[180px]">
                <ArrowUpDown className="mr-2 h-4 w-4 opacity-50" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="next_followup">Next Follow-up</SelectItem>
                <SelectItem value="last_contacted">Last Contacted</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter Button */}
            <Button 
              variant="outline" 
              onClick={() => setFilterSidebarOpen(true)}
              className="gap-2 flex-1 md:flex-none"
            >
              <Filter className="h-4 w-4" />
              Filters
              {(selectedStatuses.length + selectedSources.length + selectedTags.length + selectedAssignedTo.length) > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedStatuses.length + selectedSources.length + selectedTags.length + selectedAssignedTo.length}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Active Filters Display */}
        {(selectedStatuses.length > 0 || selectedSources.length > 0 || selectedTags.length > 0 || selectedAssignedTo.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {selectedStatuses.map(status => (
              <Badge key={status} variant="secondary" className="gap-1">
                {status}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setSelectedStatuses(selectedStatuses.filter(s => s !== status))}
                />
              </Badge>
            ))}
            {selectedSources.map(source => (
              <Badge key={source} variant="secondary" className="gap-1">
                {source}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setSelectedSources(selectedSources.filter(s => s !== source))}
                />
              </Badge>
            ))}
            {selectedTags.map(tagId => {
              const tag = allTags.find(t => t._id === tagId);
              return tag ? (
                <Badge key={tagId} variant="secondary" className="gap-1" style={{ backgroundColor: tag.color, color: 'white' }}>
                  {tag.name}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => setSelectedTags(selectedTags.filter(t => t !== tagId))}
                  />
                </Badge>
              ) : null;
            })}
            {selectedAssignedTo.map(userId => {
              const u = allUsers.find(user => user._id === userId);
              return u ? (
                <Badge key={userId} variant="secondary" className="gap-1">
                  👤 {u.name || u.email}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => setSelectedAssignedTo(selectedAssignedTo.filter(id => id !== userId))}
                  />
                </Badge>
              ) : null;
            })}
          </div>
        )}

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Leads List */}
          <div className={`${selectedLeadId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-1/3 lg:w-1/4 min-w-[300px] border rounded-lg bg-card shadow-sm overflow-hidden`}>
            <div className="p-2 border-b bg-muted/50 text-sm font-medium text-muted-foreground flex justify-between items-center">
              <span>{filteredLeads.length} Leads</span>
              {filter === "all" && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  Admin View
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {filteredLeads.map((lead: Doc<"leads">) => (
                <LeadCard
                  key={lead._id}
                  lead={lead}
                  isSelected={selectedLeadId === lead._id}
                  isUnassignedView={filter === "unassigned"}
                  viewIrrelevant={false}
                  isAdmin={user?.role === "admin"}
                  allUsers={allUsers || []}
                  onSelect={handleLeadSelect}
                  onAssignToSelf={handleAssignToSelf}
                  onAssignToUser={handleAssignToUser}
                  onUnassign={filter === "mine" || user?.role === "admin" ? handleUnassign : undefined}
                  onOpenWhatsApp={handleOpenWhatsApp}
                />
              ))}
              {paginatedResult && !paginatedResult.isDone && (
                <div ref={loadMoreRef} className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {filteredLeads.length === 0 && paginatedResult?.isDone && (
                <div className="p-8 text-center text-muted-foreground">
                  No leads found matching your criteria.
                </div>
              )}
            </div>
          </div>

          {/* Lead Details */}
          {selectedLeadId ? (
            <div className="flex-1 min-w-0 h-full">
              <LeadDetails 
                leadId={selectedLeadId} 
                onClose={() => {
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete("leadId");
                  setSearchParams(newParams);
                  setSelectedLeadId(null);
                }} 
              />
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center border rounded-lg bg-muted/10 text-muted-foreground">
              Select a lead to view details
            </div>
          )}
        </div>

        {/* Filter Sidebar */}
        <LeadsFilterSidebar
          open={filterSidebarOpen}
          onOpenChange={setFilterSidebarOpen}
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
        />

        {/* WhatsApp Dialog */}
        <Dialog open={whatsAppDialogOpen} onOpenChange={setWhatsAppDialogOpen}>
          <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
            <DialogHeader className="px-6 py-4 border-b">
              <DialogTitle>WhatsApp Chat - {whatsAppLead?.name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              {whatsAppLeadId && whatsAppLead && (
                <ChatWindow 
                  selectedLeadId={whatsAppLeadId} 
                  selectedLead={whatsAppLead}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        <AssignLeadDialog
          open={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          onConfirm={async () => {
            if (!user || !leadToAssign || !followUpDate) return;
            try {
              await assignLead({
                leadId: leadToAssign,
                userId: user._id,
                adminId: user._id,
                nextFollowUpDate: new Date(followUpDate).getTime(),
              });
              toast.success("Lead assigned successfully");
              setIsAssignDialogOpen(false);
              setLeadToAssign(null);
              setFollowUpDate("");
            } catch (error) {
              toast.error("Failed to assign lead");
            }
          }}
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
    </AppLayout>
  );
}