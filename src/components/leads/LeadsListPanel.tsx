import { Doc, Id } from "@/convex/_generated/dataModel";
import { LeadCard } from "@/components/LeadCard";
import { Loader2 } from "lucide-react";
import { useLeadSummaries } from "@/hooks/useLeadSummaries";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";
import { motion, AnimatePresence } from "framer-motion";

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
  r2Leads?: any[];
  onRestoreR2Lead?: (r2Id: any) => void;
  isRestoring?: boolean;
}

function UnassignedEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="flex flex-col items-center justify-center h-full py-12 px-6 text-center"
    >
      {/* Celebratory SVG illustration */}
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.2, duration: 0.5, type: "spring", stiffness: 200 }}
        className="mb-6"
      >
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Trophy base */}
          <rect x="45" y="95" width="30" height="8" rx="2" fill="hsl(var(--primary)/0.2)" stroke="hsl(var(--primary))" strokeWidth="1.5"/>
          <rect x="40" y="103" width="40" height="6" rx="2" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary))" strokeWidth="1.5"/>
          {/* Trophy cup */}
          <path d="M35 30 Q35 75 60 80 Q85 75 85 30 Z" fill="hsl(var(--primary)/0.15)" stroke="hsl(var(--primary))" strokeWidth="2"/>
          <path d="M55 80 L55 95 M65 80 L65 95" stroke="hsl(var(--primary))" strokeWidth="2"/>
          {/* Trophy handles */}
          <path d="M35 40 Q20 40 20 55 Q20 65 35 65" stroke="hsl(var(--primary))" strokeWidth="2" fill="none"/>
          <path d="M85 40 Q100 40 100 55 Q100 65 85 65" stroke="hsl(var(--primary))" strokeWidth="2" fill="none"/>
          {/* Star */}
          <path d="M60 38 L62.5 45 L70 45 L64 49.5 L66.5 57 L60 52.5 L53.5 57 L56 49.5 L50 45 L57.5 45 Z" fill="hsl(var(--primary))" opacity="0.8"/>
          {/* Confetti */}
          <motion.rect x="15" y="15" width="6" height="6" rx="1" fill="#f59e0b" opacity="0.8"
            animate={{ y: [15, 10, 15], rotate: [0, 45, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.rect x="100" y="20" width="5" height="5" rx="1" fill="#10b981" opacity="0.8"
            animate={{ y: [20, 14, 20], rotate: [0, -45, 0] }}
            transition={{ duration: 2.3, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
          />
          <motion.circle cx="25" cy="50" r="4" fill="#3b82f6" opacity="0.7"
            animate={{ y: [50, 44, 50] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          />
          <motion.circle cx="95" cy="45" r="3" fill="#f97316" opacity="0.7"
            animate={{ y: [45, 39, 45] }}
            transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}
          />
          <motion.rect x="10" y="80" width="7" height="4" rx="1" fill="#8b5cf6" opacity="0.7"
            animate={{ y: [80, 74, 80], rotate: [0, 30, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          />
          <motion.rect x="103" y="75" width="6" height="4" rx="1" fill="#ec4899" opacity="0.7"
            animate={{ y: [75, 69, 75], rotate: [0, -30, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
          />
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        <h3 className="text-lg font-semibold text-foreground mb-2">
          All Leads Assigned! 🎉
        </h3>
        <p className="text-sm text-muted-foreground max-w-[220px] leading-relaxed">
          Outstanding work — every lead has been picked up. The pipeline is clear and your team is on it.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.4 }}
        className="mt-4 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary font-medium"
      >
        ✓ Queue is empty
      </motion.div>
    </motion.div>
  );
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

  // Get visible lead IDs (all Convex leads now — no R2)
  const visibleLeadIds = leads.slice(0, 20).map(l => l._id);

  // Load cached summaries for all visible leads
  const cachedSummaries = useQuery(
    api.aiMutations.getCachedSummaries,
    visibleLeadIds.length > 0 ? { leadIds: visibleLeadIds } : "skip"
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
          subject: lead.subject || "",
          source: lead.source || "",
          status: lead.status,
          type: lead.type || "",
          message: lead.message || "",
          lastActivity: lead.lastActivity,
        });
      }
    });
  }, [leads, summaries, loading]);

  // Poll for cached summaries for visible loading leads
  const firstLoadingLeadId = visibleLeadIds.find(id => loading[id]);

  const cachedSummary = useQuery(
    api.aiMutations.getCachedSummary,
    firstLoadingLeadId ? { leadId: firstLoadingLeadId } : "skip"
  );

  useEffect(() => {
    if (cachedSummary?.summary && firstLoadingLeadId && loading[firstLoadingLeadId]) {
      updateSummary(firstLoadingLeadId, cachedSummary.summary);
    }
  }, [cachedSummary, firstLoadingLeadId]);

  const handleRegenerateSummary = (leadId: Id<"leads">) => {
    const lead = leads.find(l => l._id === leadId);
    if (lead) {
      fetchSummary(leadId, {
        name: lead.name,
        subject: lead.subject || "",
        source: lead.source || "",
        status: lead.status,
        type: lead.type || "",
        message: lead.message || "",
        lastActivity: lead.lastActivity,
      }, undefined, true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`${selectedLeadId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[44%] lg:w-[34%] min-w-[400px] border rounded-lg bg-card shadow-sm overflow-hidden`}
    >
      <div className="p-2 border-b bg-muted/50 text-sm font-medium text-muted-foreground flex justify-between items-center">
        <motion.span
          key={leads.length}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          {leads.length} Leads
        </motion.span>
        {filter === "all" && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            Admin View
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Empty state for unassigned leads */}
        {leads.length === 0 && isDone && filter === "unassigned" && (
          <UnassignedEmptyState />
        )}

        {/* Generic empty state for other filters */}
        {leads.length === 0 && isDone && filter !== "unassigned" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="p-8 text-center text-muted-foreground"
          >
            No leads found matching your criteria.
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {leads.map((lead: any, index: number) => (
            <motion.div
              key={lead._id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{
                duration: 0.25,
                delay: Math.min(index * 0.03, 0.3),
                ease: "easeOut",
              }}
              layout
            >
              <LeadCard
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
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoadingMore && !isDone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            ref={loadMoreRef}
            className="flex justify-center py-4"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}