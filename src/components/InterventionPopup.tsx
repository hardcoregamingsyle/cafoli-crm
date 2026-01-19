import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { getConvexApi } from "@/lib/convex-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AlertCircle, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

interface InterventionPopupProps {
  userId: Id<"users">;
}

export function InterventionPopup({ userId }: InterventionPopupProps) {
  const api = getConvexApi();
  const navigate = useNavigate();
  const interventions = useQuery((api as any).interventionRequests.getPendingInterventions, { userId });
  const claimIntervention = useMutation((api as any).interventionRequests.claimIntervention);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);

  if (!interventions || interventions.length === 0) {
    return null;
  }

  const current = interventions[currentIndex];

  const handleIntervene = async () => {
    setIsClaiming(true);
    try {
      const result = await claimIntervention({
        interventionId: current._id,
        userId,
      });
      
      toast.success("Intervention claimed! Opening chat...");
      
      // Navigate to WhatsApp page with the lead selected
      navigate(`/whatsapp?leadId=${result.leadId}`);
      
      // Move to next intervention if any
      if (currentIndex < interventions.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setCurrentIndex(0);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to claim intervention");
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Human Intervention Required
          </DialogTitle>
          <DialogDescription>
            {current.assignedTo ? "Your lead needs assistance" : "A lead needs immediate attention"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-3">
            <div>
              <span className="text-sm font-medium">Lead:</span>
              <p className="text-sm font-semibold">{current.lead?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{current.lead?.mobile}</p>
            </div>
            
            {current.requestedProduct && (
              <div>
                <span className="text-sm font-medium">Requested Product:</span>
                <Badge variant="outline" className="ml-2">{current.requestedProduct}</Badge>
              </div>
            )}
            
            <div>
              <span className="text-sm font-medium">Customer Message:</span>
              <p className="text-sm mt-1 italic bg-background p-2 rounded border">
                "{current.customerMessage}"
              </p>
            </div>

            <div>
              <span className="text-sm font-medium">AI Assessment:</span>
              <p className="text-sm mt-1 bg-background p-2 rounded border">
                {current.aiDraftedMessage}
              </p>
            </div>
          </div>

          {!current.assignedTo && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                ⚡ This lead is unassigned. First to intervene will be assigned this lead.
              </p>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Intervention {currentIndex + 1} of {interventions.length}
          </div>

          <Button
            variant="default"
            className="w-full"
            onClick={handleIntervene}
            disabled={isClaiming}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            {isClaiming ? "Claiming..." : "Intervene Now"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}