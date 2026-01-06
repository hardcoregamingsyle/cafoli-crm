import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LeadDetailsFollowUpDialogsProps {
  showFollowUpCheck: boolean;
  showNewFollowUpDialog: boolean;
  tempFollowUpDate: string;
  isTestMode: boolean;
  onFollowUpDone: () => void;
  onFollowUpNotDone: () => void;
  onSetFollowUpDate: (date: string) => void;
  onTempDateChange: (date: string) => void;
  onCloseNewFollowUp: () => void;
  getMinDateTime: () => string;
  getMaxDateTime: () => string;
}

export function LeadDetailsFollowUpDialogs({
  showFollowUpCheck,
  showNewFollowUpDialog,
  tempFollowUpDate,
  isTestMode,
  onFollowUpDone,
  onFollowUpNotDone,
  onSetFollowUpDate,
  onTempDateChange,
  onCloseNewFollowUp,
  getMinDateTime,
  getMaxDateTime,
}: LeadDetailsFollowUpDialogsProps) {
  return (
    <>
      {/* Follow-up Check Dialog */}
      <Dialog open={showFollowUpCheck} onOpenChange={(open) => !open && onFollowUpNotDone()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Follow-up Check</DialogTitle>
            <DialogDescription>
              Is the follow-up for this lead done?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={onFollowUpNotDone}>
              No
            </Button>
            <Button onClick={onFollowUpDone}>
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Follow-up Date Dialog */}
      <Dialog open={showNewFollowUpDialog} onOpenChange={(open) => isTestMode && !open && onCloseNewFollowUp()}>
        <DialogContent 
          showCloseButton={isTestMode}
          onInteractOutside={(e) => !isTestMode && e.preventDefault()}
          onEscapeKeyDown={(e) => !isTestMode && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Set Next Follow-up</DialogTitle>
            <DialogDescription>
              Please schedule the next follow-up date.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="datetime-local"
              value={tempFollowUpDate}
              onChange={(e) => onTempDateChange(e.target.value)}
              min={getMinDateTime()}
              max={getMaxDateTime()}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => onSetFollowUpDate(tempFollowUpDate)}>
              Set Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
