import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AlertCircle, X, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

interface InterventionPopupProps {
  userId: Id<"users">;
}

export function InterventionPopup({ userId }: InterventionPopupProps) {
  const interventions = useQuery(api.interventionRequests.getPendingInterventions, { userId });
  const resolveIntervention = useMutation(api.interventionRequests.resolveIntervention);
  
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!interventions || interventions.length === 0) {
    return null;
  }

  const current = interventions[currentIndex];

  const handleResolve = async (status: "resolved" | "dismissed") => {
    try {
      await resolveIntervention({
        interventionId: current._id,
        status,
      });
      
      toast.success(status === "resolved" ? "Marked as resolved" : "Dismissed");
      
      // Move to next intervention or close
      if (currentIndex < interventions.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setCurrentIndex(0);
      }
    } catch (error) {
      toast.error("Failed to update intervention");
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Product Intervention Required
          </DialogTitle>
          <DialogDescription>
            A customer is asking about a product not in the database
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div>
              <span className="text-sm font-medium">Lead:</span>
              <p className="text-sm">{current.lead?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{current.lead?.mobile}</p>
            </div>
            
            <div>
              <span className="text-sm font-medium">Requested Product:</span>
              <Badge variant="outline" className="ml-2">{current.requestedProduct}</Badge>
            </div>
            
            <div>
              <span className="text-sm font-medium">Customer Message:</span>
              <p className="text-sm mt-1 italic">"{current.customerMessage}"</p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Intervention {currentIndex + 1} of {interventions.length}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleResolve("dismissed")}
            >
              <X className="h-4 w-4 mr-2" />
              Dismiss
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={() => handleResolve("resolved")}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark Resolved
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
