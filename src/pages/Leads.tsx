import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation, useAction } from "convex/react";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useSearchParams } from "react-router";
import { Plus, Search, Loader2, RefreshCw } from "lucide-react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { useInView } from "react-intersection-observer";
import LeadDetails from "@/components/LeadDetails";
import { LeadCard } from "@/components/LeadCard";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { AssignLeadDialog } from "@/components/leads/AssignLeadDialog";
import { LeadsFilterBar } from "@/components/leads/LeadsFilterBar";
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

  const allTags = useQuery(api.tags.getAllTags) || [];
  const uniqueSources = useQuery(api.leads.queries.getUniqueSources) || [];
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

  const assignLead = useMutation(api.leads.standard.assignLead);

  const handleLeadSelect = (id: Id<"leads">) => {
    setSelectedLeadId(id);
  };

  const handleAssignToSelf = async (leadId: Id<"leads">) => {
    if (!user) return;
    setLeadToAssign(leadId);
    setFollowUpDate("");
    setIsAssignDialogOpen(true);
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

  const leadsData = useQuery(
    api.leads.queries.getLeads, 
    user ? { userId: user._id, filter } : "skip"
  ) || [];

  const sortedLeads = useMemo(() => {
    if (!leadsData) return [];
    return [...leadsData].sort((a: Doc<"leads">, b: Doc<"leads">) => {
      if (sortBy === "newest") return (b._creationTime || 0) - (a._creationTime || 0);
      if (sortBy === "oldest") return (a._creationTime || 0) - (b._creationTime || 0);
      return 0;
    });
  }, [leadsData, sortBy]);

  const filteredLeads = leadsData?.filter((lead: any) => {
    // Search filter
    if (search) {
      const query = search.toLowerCase();
      const matchesSearch = 
        lead.name?.toLowerCase().includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.mobile?.toLowerCase().includes(query) ||
        lead.company?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Tag filter - fix type issue
    if (selectedTags && selectedTags.length > 0) {
      const hasTag = selectedTags.some(tag => lead.tags?.includes(tag));
      if (!hasTag) return false;
    }

    // Status filter
    if (selectedStatuses && selectedStatuses.length > 0) {
      if (selectedStatuses.includes(lead.status)) return true;
      return false;
    }

    // Source filter
    if (selectedSources && selectedSources.length > 0) {
      if (selectedSources.includes(lead.source)) return true;
      return false;
    }

    // Assigned filter - fix type issue
    if (selectedAssignedTo && selectedAssignedTo.length > 0) {
      if (selectedAssignedTo.includes(lead.assignedTo)) return true;
      return false;
    }

    return true;
  }) || [];

  const handleOpenWhatsApp = (leadId: Id<"leads">) => {
    setWhatsAppLeadId(leadId);
    setWhatsAppDialogOpen(true);
  };

  const whatsAppLead = whatsAppLeadId && sortedLeads ? sortedLeads.find(l => l._id === whatsAppLeadId) : null;

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">
              Manage and track your leads
            </p>
          </div>
          <div className="flex gap-2">
            <CreateLeadDialog 
              open={isCreateOpen} 
              onOpenChange={setIsCreateOpen} 
              userId={user?._id as Id<"users">} 
            />
          </div>
        </div>

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

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Leads List */}
          <div className={`${selectedLeadId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-1/3 lg:w-1/4 min-w-[300px] border rounded-lg bg-card shadow-sm overflow-hidden`}>
            <div className="p-2 border-b bg-muted/50 text-sm font-medium text-muted-foreground flex justify-between items-center">
              <span>{sortedLeads.length} Leads</span>
              {filter === "all" && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  Admin View
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {sortedLeads.map((lead: Doc<"leads">) => (
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
                />
              ))}
              {sortedLeads.length === 0 && (
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead._id}
              lead={lead}
              isSelected={selectedLeadId === lead._id}
              isUnassignedView={filter === "unassigned"}
              viewIrrelevant={false}
              isAdmin={user?.role === "admin"}
              allUsers={allUsers || []}
              onSelect={setSelectedLeadId}
              onAssignToSelf={handleAssignToSelf}
              onAssignToUser={handleAssignToUser}
              onOpenWhatsApp={handleOpenWhatsApp}
            />
          ))}
        </div>

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