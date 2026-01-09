import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { getConvexApi } from "@/lib/convex-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

interface FollowUpReminderPopupProps {
  userId: Id<"users">;
}

export function FollowUpReminderPopup({ userId }: FollowUpReminderPopupProps) {
  const api = getConvexApi();
  const navigate = useNavigate();
  const followUpRequired = useQuery((api as any).interventionRequests.checkFollowUpRequired, { userId });
  const markFollowUpComplete = useMutation((api as any).interventionRequests.resolveIntervention);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (followUpRequired) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [followUpRequired]);

  // Auto-dismiss if lead now has a follow-up date
  useEffect(() => {
    if (followUpRequired && followUpRequired.lead?.nextFollowUpDate) {
      // Lead now has a follow-up, mark intervention as resolved
      markFollowUpComplete({
        interventionId: followUpRequired.interventionId,
        status: "resolved",
      });
      setIsOpen(false);
    }
  }, [followUpRequired, markFollowUpComplete]);

  if (!followUpRequired) {
    return null;
  }

  const handleScheduleFollowUp = () => {
    setIsOpen(false);
    // Navigate to the lead's page to schedule follow-up
    navigate(`/my_leads?leadId=${followUpRequired.leadId}&action=schedule_followup`);
    toast.info("Please schedule a follow-up for this lead");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Follow-Up Required
          </DialogTitle>
          <DialogDescription>
            This lead was unassigned and needs a follow-up date
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div>
              <span className="text-sm font-medium">Lead:</span>
              <p className="text-sm font-semibold">{followUpRequired.lead?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{followUpRequired.lead?.mobile}</p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              Since you claimed this previously unassigned lead, please schedule a follow-up to track your progress.
            </p>
          </div>

          <Button
            variant="default"
            className="w-full"
            onClick={handleScheduleFollowUp}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Schedule Follow-Up
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}