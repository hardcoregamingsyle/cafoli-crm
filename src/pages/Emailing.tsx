import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Send } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { LeadSelector } from "@/components/LeadSelector";
import { EmailComposer } from "@/components/emailing/EmailComposer";
import { EmailTemplateManager } from "@/components/emailing/EmailTemplateManager";
import { EmailTemplateDialog } from "@/components/emailing/EmailTemplateDialog";

export default function Emailing() {
  const { user } = useAuth();
  const templates = useQuery(api.emailTemplates.getAllTemplates) || [];
  const createTemplate = useMutation(api.emailTemplates.createTemplate);
  const updateTemplate = useMutation(api.emailTemplates.updateTemplate);
  const deleteTemplate = useMutation(api.emailTemplates.deleteTemplate);
  const sendEmailAction = useAction(api.emailActions.sendEmail);

  const isAdmin = user?.role === "admin";
  const leads = useQuery(api.leads.queries.getLeads, user ? { 
    filter: isAdmin ? "all" : "mine" 
  } : "skip") || [];

  const [activeTab, setActiveTab] = useState("send");
  
  // Send Email State
  const [senderPrefix, setSenderPrefix] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [isLeadSelectorOpen, setIsLeadSelectorOpen] = useState(false);
  
  const [emailSubject, setEmailSubject] = useState("");
  const [emailContent, setEmailContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");

  // Template State
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<{id?: Id<"emailTemplates">, name: string, subject: string, content: string} | null>(null);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderPrefix || selectedLeadIds.length === 0 || !emailSubject || !emailContent) {
      toast.error("Please fill in all fields and select at least one lead");
      return;
    }

    setIsSending(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Get selected leads with emails
      const recipients = leads.filter(l => selectedLeadIds.includes(l._id) && l.email);
      
      if (recipients.length === 0) {
        toast.error("Selected leads do not have valid email addresses");
        setIsSending(false);
        return;
      }

      toast.info(`Sending emails to ${recipients.length} recipients...`);

      // Send emails sequentially to avoid rate limits and better error tracking
      for (const lead of recipients) {
        if (!lead.email) continue;
        
        const result = await sendEmailAction({
          senderPrefix,
          to: lead.email,
          subject: emailSubject,
          htmlContent: emailContent,
        });

        if (result.success) {
          successCount++;
        } else {
          failCount++;
          console.error(`Failed to send to ${lead.email}:`, result.error);
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully sent ${successCount} emails!`);
        if (failCount > 0) {
          toast.warning(`Failed to send ${failCount} emails.`);
        }
        
        // Clear form
        setSelectedLeadIds([]);
        setEmailSubject("");
        setEmailContent("");
        setSelectedTemplateId("none");
      } else {
        toast.error("Failed to send emails. Please check logs.");
      }
    } catch (error) {
      toast.error("An error occurred while sending emails");
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!user) return;
    if (!editingTemplate?.name || !editingTemplate?.subject || !editingTemplate?.content) {
      toast.error("Please fill in all template fields");
      return;
    }

    try {
      if (editingTemplate.id) {
        await updateTemplate({
          id: editingTemplate.id,
          name: editingTemplate.name,
          subject: editingTemplate.subject,
          content: editingTemplate.content,
        });
        toast.success("Template updated");
      } else {
        await createTemplate({
          name: editingTemplate.name,
          subject: editingTemplate.subject,
          content: editingTemplate.content,
          userId: user._id,
        });
        toast.success("Template created");
      }
      setIsTemplateDialogOpen(false);
      setEditingTemplate(null);
    } catch (error) {
      toast.error("Failed to save template");
    }
  };

  const handleLoadTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === "none") {
      setEmailSubject("");
      setEmailContent("");
      return;
    }
    
    const template = templates.find(t => t._id === templateId);
    if (template) {
      setEmailSubject(template.subject);
      setEmailContent(template.content);
    }
  };

  const openNewTemplateDialog = () => {
    setEditingTemplate({ name: "", subject: "", content: "" });
    setIsTemplateDialogOpen(true);
  };

  const openEditTemplateDialog = (template: any) => {
    setEditingTemplate({
      id: template._id,
      name: template.name,
      subject: template.subject,
      content: template.content,
    });
    setIsTemplateDialogOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Emailing</h1>
          <p className="text-muted-foreground">Send custom emails and manage templates.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="send" className="flex items-center gap-2">
              <Send className="h-4 w-4" /> Send Email
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="mt-6">
            <EmailComposer
              senderPrefix={senderPrefix}
              setSenderPrefix={setSenderPrefix}
              selectedLeadIds={selectedLeadIds}
              leads={leads as any[]}
              emailSubject={emailSubject}
              setEmailSubject={setEmailSubject}
              emailContent={emailContent}
              setEmailContent={setEmailContent}
              isSending={isSending}
              handleSendEmail={handleSendEmail}
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              handleLoadTemplate={handleLoadTemplate}
              onOpenLeadSelector={() => setIsLeadSelectorOpen(true)}
            />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <EmailTemplateManager
              templates={templates}
              onEdit={openEditTemplateDialog}
              onDelete={deleteTemplate}
              onCreate={openNewTemplateDialog}
            />
          </TabsContent>
        </Tabs>

        <EmailTemplateDialog
          open={isTemplateDialogOpen}
          onOpenChange={setIsTemplateDialogOpen}
          editingTemplate={editingTemplate}
          setEditingTemplate={setEditingTemplate}
          onSave={handleSaveTemplate}
        />

        <LeadSelector 
          isOpen={isLeadSelectorOpen}
          onClose={() => setIsLeadSelectorOpen(false)}
          leads={leads as any[]}
          selectedLeadIds={selectedLeadIds}
          onSelectionChange={setSelectedLeadIds}
        />
      </div>
    </AppLayout>
  );
}