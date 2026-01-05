import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useSearchParams } from "react-router";
import LeadDetails from "@/components/LeadDetails";
import { Eye, ArrowLeft, X } from "lucide-react";

interface ColdCallerPopupProps {
  leads: Doc<"leads">[];
  isOpen: boolean;
  onClose: () => void;
  userId: Id<"users">;
}

export function ColdCallerPopup({ leads, isOpen, onClose, userId }: ColdCallerPopupProps) {
  const [followUpDates, setFollowUpDates] = useState<Record<string, string>>({});
  const [leadTypes, setLeadTypes] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    leads.forEach(lead => {
      initial[lead._id] = lead.type || "To be Decided";
    });
    return initial;
  });
  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | null>(null);
  const updateLead = useMutation(api.leads.standard.updateLead);
  const [searchParams] = useSearchParams();
  const isTestMode = searchParams.get("test-mode") === "true";

  const handleDateChange = (leadId: string, date: string) => {
    setFollowUpDates(prev => ({ ...prev, [leadId]: date }));
  };

  const handleTypeChange = (leadId: string, type: string) => {
    setLeadTypes(prev => ({ ...prev, [leadId]: type }));
  };

  const setOneHourTimer = (leadId: string) => {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
    handleDateChange(leadId, localISOTime);
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
      // Update all leads with follow-up dates and types
      await Promise.all(
        leads.map(lead => 
          updateLead({
            id: lead._id,
            patch: {
              nextFollowUpDate: new Date(followUpDates[lead._id]).getTime(),
              type: leadTypes[lead._id],
            },
            userId,
          })
        )
      );

      toast.success("Follow-up dates and lead types set for all Cold Caller Leads");
      onClose();
    } catch (error) {
      toast.error("Failed to set follow-up dates");
    }
  };

  // If a lead is selected, show LeadDetails in a larger dialog content
  if (selectedLeadId) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          if (isTestMode) onClose();
          // If user clicks outside or escape, we close the whole popup
          onClose();
        }
      }}>
        <DialogContent 
          className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0"
          onInteractOutside={(e) => !isTestMode && e.preventDefault()}
          onEscapeKeyDown={(e) => !isTestMode && e.preventDefault()}
          showCloseButton={false}
        >
          <div className="p-2 border-b flex justify-between items-center bg-background">
            <Button variant="ghost" onClick={() => setSelectedLeadId(null)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to List
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden p-4 bg-muted/10">
            <LeadDetails 
              leadId={selectedLeadId} 
              onClose={() => setSelectedLeadId(null)} 
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => isTestMode && !open && onClose()}>
      <DialogContent 
        className="max-w-3xl max-h-[80vh] overflow-y-auto"
        onInteractOutside={(e) => !isTestMode && e.preventDefault()}
        onEscapeKeyDown={(e) => !isTestMode && e.preventDefault()}
        showCloseButton={isTestMode}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-blue-600">
            🎯 Cold Caller Leads - Set Follow-up Dates
          </DialogTitle>
          <DialogDescription>
            You have {leads.length} Cold Caller Leads assigned to you. Please set follow-up dates and classify all of them to continue.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          {leads.map((lead, index) => (
            <div key={lead._id} className="p-4 border rounded-lg bg-blue-50">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-blue-900">
                      {index + 1}. {lead.name}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLeadId(lead._id)}
                      className="h-6 px-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                  <p className="text-sm text-blue-700">{lead.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mobile: {lead.mobile}
                  </p>
                </div>
                <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">
                  Cold Caller
                </span>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor={`type-${lead._id}`}>Lead Classification *</Label>
                  <Select 
                    value={leadTypes[lead._id]} 
                    onValueChange={(value) => handleTypeChange(lead._id, value)}
                  >
                    <SelectTrigger id={`type-${lead._id}`} className="w-full mt-1">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="To be Decided">To be Decided</SelectItem>
                      <SelectItem value="Relevant">Relevant</SelectItem>
                      <SelectItem value="Irrelevant">Irrelevant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor={`followup-${lead._id}`}>Follow-up Date & Time *</Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setOneHourTimer(lead._id)}
                      className="h-6 text-xs bg-white hover:bg-blue-50 text-blue-600 border-blue-200"
                    >
                      +1 Hour
                    </Button>
                  </div>
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