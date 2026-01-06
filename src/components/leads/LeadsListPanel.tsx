import { Doc, Id } from "@/convex/_generated/dataModel";
import { LeadCard } from "@/components/LeadCard";
import { Loader2 } from "lucide-react";

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
