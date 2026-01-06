import { Button } from "@/components/ui/button";
import { X, Phone, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ReminderLeadCardProps {
  lead: any;
  isCritical: boolean;
  badgeColor: string;
  buttonVariant: "destructive" | "default";
  onNavigate: (leadId: string) => void;
  onDismiss: (leadId: string, e: React.MouseEvent) => void;
}

export function ReminderLeadCard({
  lead,
  isCritical,
  badgeColor,
  buttonVariant,
  onNavigate,
  onDismiss,
}: ReminderLeadCardProps) {
  return (
    <div className="bg-white dark:bg-card p-4 rounded-lg border shadow-sm flex flex-col gap-3 relative group">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => onDismiss(lead._id, e)}
        title="Dismiss this reminder"
      >
        <X className="h-4 w-4" />
      </Button>
      
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h4 className="font-semibold text-lg">{lead.name}</h4>
          <p className="text-sm text-muted-foreground">{lead.agencyName}</p>
          
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
            {lead.mobile && (
              <div className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <span>{lead.mobile}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                <span>{lead.email}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-2">
            <span className={cn("text-xs px-2 py-1 rounded-full font-medium", 
              lead.status === "Mature" 
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : lead.status === "Hot"
                  ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                  : badgeColor
            )}>
              {lead.status}
            </span>
            {isCritical && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 font-medium">
                Overdue: {lead.nextFollowUpDate ? format(lead.nextFollowUpDate, "PP") : "Unknown"}
              </span>
            )}
            {!isCritical && (
               <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 font-medium">
                 {lead.type}
               </span>
            )}
          </div>
        </div>
        <Button 
          variant={buttonVariant}
          size="sm"
          className={!isCritical ? "bg-blue-600 hover:bg-blue-700" : ""}
          onClick={() => onNavigate(lead._id)}
        >
          {isCritical ? "Follow Up Now" : "Take Action"}
        </Button>
      </div>
    </div>
  );
}
