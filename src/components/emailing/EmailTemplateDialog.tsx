import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Id } from "@/convex/_generated/dataModel";
import { Dispatch, SetStateAction } from "react";

interface TemplateData {
  id?: Id<"emailTemplates">;
  name: string;
  subject: string;
  content: string;
}

interface EmailTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTemplate: TemplateData | null;
  setEditingTemplate: Dispatch<SetStateAction<TemplateData | null>>;
  onSave: () => void;
}

export function EmailTemplateDialog({
  open,
  onOpenChange,
  editingTemplate,
  setEditingTemplate,
  onSave
}: EmailTemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingTemplate?.id ? "Edit Template" : "Create New Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="t-name">Template Name</Label>
            <Input 
              id="t-name" 
              value={editingTemplate?.name || ""} 
              onChange={(e) => setEditingTemplate(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
              placeholder="e.g. Welcome Email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-subject">Default Subject</Label>
            <Input 
              id="t-subject" 
              value={editingTemplate?.subject || ""} 
              onChange={(e) => setEditingTemplate(prev => prev ? ({ ...prev, subject: e.target.value }) : null)}
              placeholder="Subject line"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-content">Content (HTML)</Label>
            <Textarea 
              id="t-content" 
              value={editingTemplate?.content || ""} 
              onChange={(e) => setEditingTemplate(prev => prev ? ({ ...prev, content: e.target.value }) : null)}
              placeholder="<html>...</html>"
              className="min-h-[300px] font-mono text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave}>Save Template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}