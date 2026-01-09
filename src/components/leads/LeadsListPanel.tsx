import { Doc, Id } from "@/convex/_generated/dataModel";
import { LeadCard } from "@/components/LeadCard";
import { Loader2 } from "lucide-react";
import { useLeadSummaries } from "@/hooks/useLeadSummaries";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";

const api = getConvexApi() as any;

interface LeadsListPanelProps {
  leads: Doc<"leads">[];
  selectedLeadId: Id<"leads"> | null;
  filter: string;
  isAdmin: boolean;
  allUsers: Doc<"users">[];
  onSelect: (id: Id<"leads">) => void;
  onAssignToSelf: (id: Id<"leads">) => void;
  onAssignToUser: (leadId: Id<"leads">, userId: Id<"users">) => void;
  onUnassign?: (leadId: Id<"leads">) => void;
  onOpenWhatsApp: (leadId: Id<"leads">) => void;
  loadMoreRef: (node?: Element | null) => void;
  isLoadingMore: boolean;
  isDone: boolean;
}

export function LeadsListPanel({
  leads,
  selectedLeadId,
  filter,
  isAdmin,
  allUsers,
  onSelect,
  onAssignToSelf,
  onAssignToUser,
  onUnassign,
  onOpenWhatsApp,
  loadMoreRef,
  isLoadingMore,
  isDone,
}: LeadsListPanelProps) {
  const { summaries, loading, fetchSummary, updateSummary } = useLeadSummaries();

  // Get visible lead IDs
  const visibleLeadIds = leads.slice(0, 20).map(l => l._id);

  // Load cached summaries for all visible leads
  const cachedSummaries = useQuery(
    api.aiMutations.getCachedSummaries,
    { leadIds: visibleLeadIds }
  );

  // Update summaries from cache
  useEffect(() => {
    if (cachedSummaries) {
      cachedSummaries.forEach(({ leadId, summary }: { leadId: Id<"leads">, summary?: string }) => {
        if (summary && !summaries[leadId]) {
          updateSummary(leadId, summary);
        }
      });
    }
  }, [cachedSummaries]);

  // Fetch summaries for visible leads that don't have cached summaries
  useEffect(() => {
    leads.slice(0, 20).forEach(lead => {
      if (!summaries[lead._id] && !loading[lead._id]) {
        fetchSummary(lead._id, {
          name: lead.name,
          subject: lead.subject,
          source: lead.source,
          status: lead.status,
          type: lead.type,
          message: lead.message,
          lastActivity: lead.lastActivity,
        });
      }
    });
  }, [leads, summaries, loading]);

  // Poll for cached summaries for visible loading leads
  const firstLoadingLeadId = visibleLeadIds.find(id => loading[id]);

  // Query one at a time to check for completion
  const cachedSummary = useQuery(
    api.aiMutations.getCachedSummary,
    firstLoadingLeadId ? { leadId: firstLoadingLeadId } : "skip"
  );

  useEffect(() => {
    if (cachedSummary?.summary && firstLoadingLeadId && loading[firstLoadingLeadId]) {
      updateSummary(firstLoadingLeadId, cachedSummary.summary);
    }
  }, [cachedSummary, firstLoadingLeadId]);

  // Handle manual summary regeneration
  const handleRegenerateSummary = (leadId: Id<"leads">) => {
    const lead = leads.find(l => l._id === leadId);
    if (lead) {
      fetchSummary(leadId, {
        name: lead.name,
        subject: lead.subject,
        source: lead.source,
        status: lead.status,
        type: lead.type,
        message: lead.message,
        lastActivity: lead.lastActivity,
      }, undefined, true); // Pass true to force regeneration
    }
  };

  return (
    <div className={`${selectedLeadId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-1/3 lg:w-1/4 min-w-[300px] border rounded-lg bg-card shadow-sm overflow-hidden`}>
      <div className="p-2 border-b bg-muted/50 text-sm font-medium text-muted-foreground flex justify-between items-center">
        <span>{leads.length} Leads</span>
        {filter === "all" && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            Admin View
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {leads.map((lead: Doc<"leads">) => (
          <LeadCard
            key={lead._id}
            lead={lead}
            isSelected={selectedLeadId === lead._id}
            isUnassignedView={filter === "unassigned"}
            viewIrrelevant={false}
            isAdmin={isAdmin}
            allUsers={allUsers || []}
            onSelect={onSelect}
            onAssignToSelf={onAssignToSelf}
            onAssignToUser={onAssignToUser}
            onUnassign={filter === "mine" || isAdmin ? onUnassign : undefined}
            onOpenWhatsApp={onOpenWhatsApp}
            aiSummary={summaries[lead._id]}
            aiSummaryLoading={loading[lead._id]}
            onRegenerateSummary={handleRegenerateSummary}
          />
        ))}
        {isLoadingMore && !isDone && (
          <div ref={loadMoreRef} className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {leads.length === 0 && isDone && (
          <div className="p-8 text-center text-muted-foreground">
            No leads found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
}