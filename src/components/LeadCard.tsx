import { Card, CardContent } from "@/components/ui/card";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { LeadCardHeader } from "@/components/leads/LeadCardHeader";
import { LeadCardTags } from "@/components/leads/LeadCardTags";
import { LeadCardBadges } from "@/components/leads/LeadCardBadges";
import { LeadCardActions } from "@/components/leads/LeadCardActions";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface LeadCardProps {
  lead: Doc<"leads"> & { 
    tagsData?: Doc<"tags">[]; 
    unreadCount?: number;
    assignedToName?: string;
    coldCallerAssignedToName?: string;
  };
  isSelected: boolean;
  isUnassignedView: boolean;
  viewIrrelevant: boolean;
  isAdmin: boolean;
  allUsers: Doc<"users">[];
  onSelect: (id: Id<"leads">) => void;
  onAssignToSelf: (id: Id<"leads">) => void;
  onAssignToUser: (leadId: Id<"leads">, userId: Id<"users">) => void;
  onUnassign?: (leadId: Id<"leads">) => void;
  onOpenWhatsApp?: (leadId: Id<"leads">) => void;
  aiSummary?: string;
  aiSummaryLoading?: boolean;
  onRegenerateSummary?: (leadId: Id<"leads">) => void;
}

export function LeadCard({
  lead,
  isSelected,
  isUnassignedView,
  viewIrrelevant,
  isAdmin,
  allUsers,
  onSelect,
  onAssignToSelf,
  onAssignToUser,
  onUnassign,
  onOpenWhatsApp,
  aiSummary,
  aiSummaryLoading,
  onRegenerateSummary,
}: LeadCardProps) {
  const hasUnreadMessages = (lead.unreadCount ?? 0) > 0;
  
  const getScoreBadgeColor = (tier?: string) => {
    switch (tier) {
      case "High": return "bg-green-100 text-green-700 border-green-300";
      case "Medium": return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "Low": return "bg-gray-100 text-gray-600 border-gray-300";
      default: return "bg-gray-50 text-gray-500 border-gray-200";
    }
  };
  
  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
        isSelected ? "border-primary bg-accent/50" : ""
      } ${
        lead.nextFollowUpDate && lead.nextFollowUpDate < Date.now() ? "border-red-300 bg-red-50/50" : ""
      } ${
        hasUnreadMessages ? "border-green-500 bg-green-0/30 shadow-lg" : ""
      }`}
      onClick={() => onSelect(lead._id)}
    >
      <CardContent className="p-4">
        <LeadCardHeader
          name={lead.name}
          creationTime={lead._creationTime}
          hasUnreadMessages={hasUnreadMessages}
          unreadCount={lead.unreadCount}
        />
        
        <p className="text-sm text-muted-foreground truncate mb-2">{lead.subject}</p>
        
        {/* AI Summary */}
        {aiSummaryLoading ? (
          <div className="mb-2 space-y-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : aiSummary ? (
          <div className="mb-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-900 flex items-start gap-1">
            <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0 text-purple-600" />
            <span className="line-clamp-2 flex-1">{aiSummary}</span>
            {onRegenerateSummary && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 hover:bg-purple-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRegenerateSummary(lead._id);
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Regenerate AI Summary</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        ) : onRegenerateSummary ? (
          <Button
            variant="outline"
            size="sm"
            className="mb-2 h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onRegenerateSummary(lead._id);
            }}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Generate AI Summary
          </Button>
        ) : null}

        {/* AI Score Badge */}
        {lead.aiScoreTier && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border mb-2 ${getScoreBadgeColor(lead.aiScoreTier)}`}>
                  <TrendingUp className="h-3 w-3" />
                  {lead.aiScoreTier} Priority
                  {lead.aiScore && <span className="ml-1">({Math.round(lead.aiScore)})</span>}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">{lead.aiScoreRationale || "AI-generated priority score"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        <LeadCardTags tags={lead.tagsData || []} />

        <div className="flex gap-2 text-xs flex-wrap items-center">
          <LeadCardBadges lead={lead} />
          
          <LeadCardActions
            lead={lead}
            isUnassignedView={isUnassignedView}
            viewIrrelevant={viewIrrelevant}
            isAdmin={isAdmin}
            allUsers={allUsers}
            hasUnreadMessages={hasUnreadMessages}
            onAssignToSelf={onAssignToSelf}
            onAssignToUser={onAssignToUser}
            onUnassign={onUnassign}
            onOpenWhatsApp={onOpenWhatsApp}
          />
        </div>
      </CardContent>
    </Card>
  );
}