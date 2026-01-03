import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";

interface ColdCallerPopupProps {
  leads: Doc<"leads">[];
  isOpen: boolean;
  onClose: () => void;
  userId: Id<"users">;
}

export function ColdCallerPopup({ leads, isOpen, onClose, userId }: ColdCallerPopupProps) {
  const [followUpDates, setFollowUpDates] = useState<Record<string, string>>({});
  const updateLead = useMutation(api.leads.standard.updateLead);

  const handleDateChange = (leadId: string, date: string) => {
    setFollowUpDates(prev => ({ ...prev, [leadId]: date }));
  };

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

  const handleSubmit = async () => {
    // Validate all leads have follow-up dates
    const missingDates = leads.filter(lead => !followUpDates[lead._id]);
    if (missingDates.length > 0) {
      toast.error(`Please set follow-up dates for all ${leads.length} Cold Caller Leads`);
      return;
    }

    try {
      // Update all leads with follow-up dates
      await Promise.all(
        leads.map(lead => 
          updateLead({
            id: lead._id,
            patch: {
              nextFollowUpDate: new Date(followUpDates[lead._id]).getTime(),
            },
            userId,
          })
        )
      );

      toast.success("Follow-up dates set for all Cold Caller Leads");
      onClose();
    } catch (error) {
      toast.error("Failed to set follow-up dates");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-3xl max-h-[80vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-600">
            🎯 Cold Caller Leads - Set Follow-up Dates
          </DialogTitle>
          <DialogDescription>
            You have {leads.length} Cold Caller Leads assigned to you. Please set follow-up dates for all of them to continue.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {leads.map((lead, index) => (
            <div key={lead._id} className="p-4 border rounded-lg bg-blue-50">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold text-blue-900">
                    {index + 1}. {lead.name}
                  </h4>
                  <p className="text-sm text-blue-700">{lead.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mobile: {lead.mobile}
                  </p>
                </div>
                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">
                  Cold Caller
                </span>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor={`followup-${lead._id}`}>Follow-up Date & Time *</Label>
                <Input
                  id={`followup-${lead._id}`}
                  type="datetime-local"
                  value={followUpDates[lead._id] || ""}
                  onChange={(e) => handleDateChange(lead._id, e.target.value)}
                  min={getMinDateTime()}
                  max={getMaxDateTime()}
                  required
                  className="w-full"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button
            onClick={handleSubmit}
            disabled={leads.some(lead => !followUpDates[lead._id])}
            className="w-full"
          >
            Set All Follow-up Dates ({leads.length} leads)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}