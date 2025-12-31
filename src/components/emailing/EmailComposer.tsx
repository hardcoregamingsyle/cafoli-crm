import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Doc } from "@/convex/_generated/dataModel";
import { Send, Users } from "lucide-react";

interface EmailComposerProps {
  senderPrefix: string;
  setSenderPrefix: (val: string) => void;
  selectedLeadIds: string[];
  leads: Doc<"leads">[];
  emailSubject: string;
  setEmailSubject: (val: string) => void;
  emailContent: string;
  setEmailContent: (val: string) => void;
  isSending: boolean;
  handleSendEmail: (e: React.FormEvent) => void;
  templates: Doc<"emailTemplates">[];
  selectedTemplateId: string;
  handleLoadTemplate: (id: string) => void;
  onOpenLeadSelector: () => void;
}

export function EmailComposer({
  senderPrefix,
  setSenderPrefix,
  selectedLeadIds,
  leads,
  emailSubject,
  setEmailSubject,
  emailContent,
  setEmailContent,
  isSending,
  handleSendEmail,
  templates,
  selectedTemplateId,
  handleLoadTemplate,
  onOpenLeadSelector
}: EmailComposerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Compose Email</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSendEmail} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sender">Sender Name</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="sender" 
                  placeholder="e.g. john" 
                  value={senderPrefix}
                  onChange={(e) => setSenderPrefix(e.target.value)}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">@mail.cafoli.in</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Recipients</Label>
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full justify-start text-left font-normal"
                  onClick={onOpenLeadSelector}
                >
                  <Users className="mr-2 h-4 w-4" />
                  {selectedLeadIds.length === 0 
                    ? "Select Leads..." 
                    : `${selectedLeadIds.length} lead(s) selected`}
                </Button>
              </div>
              {selectedLeadIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Selected: {leads.filter(l => selectedLeadIds.includes(l._id)).map(l => l.name).slice(0, 3).join(", ")}
                  {selectedLeadIds.length > 3 && ` and ${selectedLeadIds.length - 3} more`}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">Load Template (Optional)</Label>
            <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input 
              id="subject" 
              placeholder="Email subject" 
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content (HTML supported)</Label>
            <Textarea 
              id="content" 
              placeholder="Write your email content here..." 
              className="min-h-[300px] font-mono text-sm"
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSending || selectedLeadIds.length === 0}>
              {isSending ? (
                <>Sending...</>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Send Email ({selectedLeadIds.length})
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
