import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Clock, Bell } from "lucide-react";

interface FollowUpNotificationDialogProps {
  lead: any;
  timeType: string;
  message: string;
  onClose: () => void;
  onNavigate: (leadId: string) => void;
}

export function FollowUpNotificationDialog({
  lead,
  timeType,
  message,
  onClose,
  onNavigate,
}: FollowUpNotificationDialogProps) {
  const isNow = timeType === "now";

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`sm:max-w-[500px] ${isNow ? 'border-red-500 bg-red-50 dark:bg-red-950/20' : 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'}`}>
        <DialogHeader>
          <div className={`flex items-center gap-2 ${isNow ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
            {isNow ? <Bell className="h-6 w-6 animate-pulse" /> : <Clock className="h-6 w-6" />}
            <DialogTitle>{message}</DialogTitle>
          </div>
          <DialogDescription className={isNow ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'}>
            {isNow ? "It's time for your scheduled follow-up!" : "You have an upcoming follow-up scheduled."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="bg-white dark:bg-card p-4 rounded-lg border shadow-sm">
          <h4 className="font-semibold text-lg">{lead.name}</h4>
          <p className="text-sm text-muted-foreground">{lead.agencyName}</p>
          
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium">{lead.status}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Scheduled:</span>
              <span className="font-medium">
                {lead.nextFollowUpDate ? format(lead.nextFollowUpDate, "PPp") : "N/A"}
              </span>
            </div>
            {lead.mobile && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mobile:</span>
                <span className="font-medium">{lead.mobile}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Dismiss
          </Button>
          <Button 
            variant={isNow ? "destructive" : "default"}
            onClick={() => onNavigate(lead._id)}
            className={!isNow ? "bg-blue-600 hover:bg-blue-700" : ""}
          >
            {isNow ? "Follow Up Now" : "View Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
