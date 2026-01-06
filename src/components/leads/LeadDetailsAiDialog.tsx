import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, BrainCircuit, Calendar } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LeadDetailsAiDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isAnalyzing: boolean;
  aiAnalysis: string | null;
  onAnalyzeLead: () => void;
  onSuggestFollowUp: () => void;
}

export function LeadDetailsAiDialog({
  isOpen,
  onClose,
  isAnalyzing,
  aiAnalysis,
  onAnalyzeLead,
  onSuggestFollowUp,
}: LeadDetailsAiDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            AI Lead Assistant
          </DialogTitle>
          <DialogDescription>
            Get AI-powered insights and suggestions for this lead.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              className="h-24 flex flex-col gap-2 hover:border-purple-400 hover:bg-purple-50"
              onClick={onAnalyzeLead}
              disabled={isAnalyzing}
            >
              <BrainCircuit className="h-6 w-6 text-purple-600" />
              <span>Analyze Lead</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-24 flex flex-col gap-2 hover:border-purple-400 hover:bg-purple-50"
              onClick={onSuggestFollowUp}
              disabled={isAnalyzing}
            >
              <Calendar className="h-6 w-6 text-purple-600" />
              <span>Suggest Follow-up</span>
            </Button>
          </div>

          {isAnalyzing && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Sparkles className="h-4 w-4 mr-2 animate-spin" />
              Analyzing lead data...
            </div>
          )}

          {aiAnalysis && !isAnalyzing && (
            <ScrollArea className="flex-1 min-h-0 pr-4">
              <div className="bg-muted/50 p-4 rounded-lg text-sm whitespace-pre-wrap border">
                {aiAnalysis}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}