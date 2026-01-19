import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getConvexApi } from "@/lib/convex-api";
import { Doc } from "@/convex/_generated/dataModel";
import { Calendar, Phone, Mail } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface MandatoryFollowUpPopupProps {
  leads: Doc<"leads">[];
}

export function MandatoryFollowUpPopup({ leads }: MandatoryFollowUpPopupProps) {
  const { user } = useAuth();
  const api = getConvexApi();
  const updateLead = useMutation((api as any).leads.standard.updateLead);
  const [searchParams] = useSearchParams();
  const isTestMode = searchParams.get("test-mode") === "true";

  const [followUpDate, setFollowUpDate] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  if (!leads || leads.length === 0) {
    return null;
  }

  // Always take the first lead as the list shrinks when follow-ups are set
  const currentLead = leads[0];
  const remainingCount = leads.length;

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    return now.toISOString().slice(0, 16);
  };

  const getMaxDateTime = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 31);
    return maxDate.toISOString().slice(0, 16);
  };

  const handleSetFollowUp = async () => {
    if (!followUpDate) {
      toast.error("Please select a follow-up date");
      return;
    }

    setIsUpdating(true);
    try {
      await updateLead({
        id: currentLead._id,
        patch: {
          nextFollowUpDate: new Date(followUpDate).getTime(),
        },
        userId: user!._id,
      });

      toast.success("Follow-up date set successfully");
      setFollowUpDate("");
      
      if (leads.length === 1) {
        toast.success("All follow-ups set!");
      }
    } catch (error) {
      toast.error("Failed to set follow-up date");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[500px] max-h-[85vh] overflow-auto" 
        onInteractOutside={(e) => !isTestMode && e.preventDefault()} 
        onEscapeKeyDown={(e) => !isTestMode && e.preventDefault()}
        showCloseButton={isTestMode}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Set Follow-Up Date (Required)
          </DialogTitle>
          <DialogDescription>
            You have {remainingCount} lead{remainingCount > 1 ? "s" : ""} without a follow-up date. Please set a follow-up date to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h4 className="font-semibold text-lg">{currentLead.name}</h4>
            {currentLead.agencyName && (
              <p className="text-sm text-muted-foreground">{currentLead.agencyName}</p>
            )}
            
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {currentLead.mobile && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <span>{currentLead.mobile}</span>
                </div>
              )}
              {currentLead.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <span>{currentLead.email}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              {currentLead.status && (
                <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                  {currentLead.status}
                </span>
              )}
              {currentLead.source && (
                <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground font-medium">
                  {currentLead.source}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="followUpDate">Follow-Up Date & Time *</Label>
            <Input
              id="followUpDate"
              type="datetime-local"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              min={getMinDateTime()}
              max={getMaxDateTime()}
              required
            />
            <p className="text-xs text-muted-foreground">
              Select a date within the next 31 days
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {remainingCount} remaining
          </span>
          <Button
            onClick={handleSetFollowUp}
            disabled={isUpdating || !followUpDate}
          >
            {isUpdating ? "Setting..." : remainingCount > 1 ? "Set & Next" : "Set & Finish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}