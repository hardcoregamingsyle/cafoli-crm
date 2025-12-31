import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Mail, Plus, Trash2, Send, FileText, Edit } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

export default function Emailing() {
  const { user } = useAuth();
  const templates = useQuery(api.emailTemplates.getAllTemplates) || [];
  const createTemplate = useMutation(api.emailTemplates.createTemplate);
  const updateTemplate = useMutation(api.emailTemplates.updateTemplate);
  const deleteTemplate = useMutation(api.emailTemplates.deleteTemplate);
  const sendEmailAction = useAction(api.emailActions.sendEmail);

  const leads = useQuery(api.leads.getLeads, { 
    filter: user?.role === "admin" ? "all" : "mine" 
  }) || [];
  const leadsWithEmails = leads.filter(l => l.email);

  const [activeTab, setActiveTab] = useState("send");
  
  // Send Email State
  const [senderPrefix, setSenderPrefix] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailContent, setEmailContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");

  // Template State
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<{id?: Id<"emailTemplates">, name: string, subject: string, content: string} | null>(null);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderPrefix || !recipientEmail || !emailSubject || !emailContent) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSending(true);
    try {
      const result = await sendEmailAction({
        senderPrefix,
        to: recipientEmail,
        subject: emailSubject,
        htmlContent: emailContent,
      });

      if (result.success) {
        toast.success("Email sent successfully!");
        // Clear form
        setRecipientEmail("");
        setEmailSubject("");
        setEmailContent("");
        setSelectedTemplateId("none");
      } else {
        toast.error(`Failed to send: ${result.error}`);
      }
    } catch (error) {
      toast.error("An error occurred while sending the email");
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
                      <Label htmlFor="recipient">Recipient Lead</Label>
                      <Select value={recipientEmail} onValueChange={setRecipientEmail}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a lead" />
                        </SelectTrigger>
                        <SelectContent>
                          {leadsWithEmails.map((lead) => (
                            <SelectItem key={lead._id} value={lead.email!}>
                              {lead.name} ({lead.email})
                            </SelectItem>
                          ))}
                          {leadsWithEmails.length === 0 && (
                            <div className="p-2 text-sm text-muted-foreground text-center">
                              No leads with email addresses found
                            </div>
                          )}
                        </SelectContent>
                      </Select>
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
                    <Button type="submit" disabled={isSending}>
                      {isSending ? (
                        <>Sending...</>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" /> Send Email
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Email Templates</h2>
              <Button onClick={openNewTemplateDialog}>
                <Plus className="mr-2 h-4 w-4" /> New Template
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template._id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-medium flex justify-between items-start">
                      <span className="truncate" title={template.name}>{template.name}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditTemplateDialog(template)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteTemplate({ id: template._id })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">Subject: {template.subject}</p>
                    <div className="text-xs text-muted-foreground line-clamp-3 bg-muted p-2 rounded">
                      {template.content}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {templates.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  No templates found. Create one to get started.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
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
              <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveTemplate}>Save Template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
