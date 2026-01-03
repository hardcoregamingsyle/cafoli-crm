import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { UserPlus, ThumbsUp, MessageCircle, UserMinus } from "lucide-react";
import { toast } from "sonner";

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
}: LeadCardProps) {
  const hasUnreadMessages = (lead.unreadCount ?? 0) > 0;
  
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
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{lead.name}</h3>
            {hasUnreadMessages && (
              <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
                {lead.unreadCount} new
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(lead._creationTime).toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate mb-2">{lead.subject}</p>
        
        {lead.tagsData && lead.tagsData.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {lead.tagsData.map(tag => (
              <span 
                key={tag._id} 
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 text-xs flex-wrap items-center">
          <span className="bg-secondary px-2 py-0.5 rounded-full">{lead.source}</span>
          <span className={`px-2 py-0.5 rounded-full ${
            lead.status === 'Hot' ? 'bg-orange-100 text-orange-700' :
            lead.status === 'Mature' ? 'bg-green-100 text-green-700' :
            lead.status === 'Cold' ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-700'
          }`}>{lead.status}</span>
          
          {lead.type === 'Relevant' && (
            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
              <ThumbsUp className="h-3 w-3" />
              Relevant
            </span>
          )}
          
          {lead.adminAssignmentRequired && (
            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
              Admin Assign Only
            </span>
          )}

          {lead.nextFollowUpDate && lead.nextFollowUpDate < Date.now() && (
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium border border-red-200">
              Overdue
            </span>
          )}
          
          {(lead as any).assignedToName && (
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
              👤 {(lead as any).assignedToName}
            </span>
          )}

          {(lead as any).coldCallerAssignedToName && (
            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs border border-indigo-200">
              📞 {(lead as any).coldCallerAssignedToName}
            </span>
          )}
          
          {onOpenWhatsApp && (
            <Button
              size="sm"
              variant={hasUnreadMessages ? "default" : "outline"}
              className={`h-6 text-xs ${hasUnreadMessages ? 'bg-green-600 hover:bg-green-700 animate-pulse' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenWhatsApp(lead._id);
              }}
            >
              <MessageCircle className="h-3 w-3 mr-1" />
              WhatsApp
            </Button>
          )}
          
          {onUnassign && lead.assignedTo && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              onClick={(e) => {
                e.stopPropagation();
                onUnassign(lead._id);
              }}
            >
              <UserMinus className="h-3 w-3 mr-1" />
              Unassign
            </Button>
          )}

          {isUnassignedView && !lead.assignedTo && !viewIrrelevant && (
            <>
              {!isAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  disabled={lead.adminAssignmentRequired}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (lead.adminAssignmentRequired) {
                      toast.error("This lead can only be assigned by an admin");
                      return;
                    }
                    onAssignToSelf(lead._id);
                  }}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  Assign to me
                </Button>
              ) : (
                <Select
                  onValueChange={(userId) => {
                    onAssignToUser(lead._id, userId as Id<"users">);
                  }}
                >
                  <SelectTrigger 
                    className="h-6 text-xs w-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectValue placeholder="Assign to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((u) => (
                      <SelectItem key={u._id} value={u._id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}