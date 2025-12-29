import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

interface LeadCardProps {
  lead: Doc<"leads">;
  isSelected: boolean;
  isUnassignedView: boolean;
  viewIrrelevant: boolean;
  isAdmin: boolean;
  allUsers: Doc<"users">[];
  onSelect: (id: Id<"leads">) => void;
  onAssignToSelf: (id: Id<"leads">) => void;
  onAssignToUser: (leadId: Id<"leads">, userId: Id<"users">) => void;
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
}: LeadCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
        isSelected ? "border-primary bg-accent/50" : ""
      } ${
        lead.nextFollowUpDate && lead.nextFollowUpDate < Date.now() ? "border-red-300 bg-red-50/50" : ""
      }`}
      onClick={() => onSelect(lead._id)}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold truncate">{lead.name}</h3>
          <span className="text-xs text-muted-foreground">
            {new Date(lead._creationTime).toLocaleString()}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate mb-2">{lead.subject}</p>
        <div className="flex gap-2 text-xs flex-wrap items-center">
          <span className="bg-secondary px-2 py-0.5 rounded-full">{lead.source}</span>
          <span className={`px-2 py-0.5 rounded-full ${
            lead.status === 'Hot' ? 'bg-red-100 text-red-700' :
            lead.status === 'Mature' ? 'bg-green-100 text-green-700' :
            'bg-gray-100 text-gray-700'
          }`}>{lead.status}</span>
          
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
