import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, RefreshCw, CheckCircle, Clock, XCircle, Info, Trash2, Edit, Send as SendIcon } from "lucide-react";
import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@/convex/schema";

interface TemplatesDialogProps {
  selectedLeadId?: Id<"leads"> | null;
}

export function TemplatesDialog({ selectedLeadId }: TemplatesDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  
  const templates = useQuery(api.whatsappTemplatesQueries.getTemplates) || [];
  // Determine filter based on user role to ensure staff can see their assigned leads
  const filter = user?.role === ROLES.ADMIN ? "all" : "mine";
  const leads = useQuery(api.leads.queries.getLeads, { filter, userId: user?._id }) || [];
  
  const syncTemplates = useAction(api.whatsappTemplates.syncTemplates);
  const createTemplate = useAction(api.whatsappTemplates.createTemplate);
  const deleteTemplate = useAction(api.whatsappTemplates.deleteTemplate);
  const sendTemplateMessage = useAction(api.whatsappTemplates.sendTemplateMessage);

  const [formData, setFormData] = useState({
    name: "",
    language: "en_US",
    category: "MARKETING",
    headerType: "TEXT",
    headerText: "",
    bodyText: "",
    footerText: "",
  });

  const [sendFormData, setSendFormData] = useState({
    leadId: "" as Id<"leads"> | "",
  });

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncTemplates({});
      toast.success(`Synced ${result.count} templates from Meta`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync templates");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.bodyText) {
      toast.error("Template name and body are required");
      return;
    }

    setIsCreating(true);
    try {
      const components = [];
      
      if (formData.headerType !== "NONE" && formData.headerText) {
        components.push({
          type: "HEADER",
          format: formData.headerType,
          text: formData.headerType === "TEXT" ? formData.headerText : undefined,
        });
      }
      
      components.push({
        type: "BODY",
        text: formData.bodyText,
      });
      
      if (formData.footerText) {
        components.push({
          type: "FOOTER",
          text: formData.footerText,
        });
      }

      await createTemplate({
        name: formData.name,
        language: formData.language,
        category: formData.category,
        components,
      });

      toast.success("Template created successfully. Awaiting Meta approval.");
      setFormData({
        name: "",
        language: "en_US",
        category: "MARKETING",
        headerType: "TEXT",
        headerText: "",
        bodyText: "",
        footerText: "",
      });
      setIsCreating(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create template");
      setIsCreating(false);
    }
  };

  const handleDelete = async (template: any) => {
    if (!confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      return;
    }

    try {
      await deleteTemplate({
        templateName: template.name,
        templateId: template._id,
      });
      toast.success("Template deleted successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete template");
    }
  };

  const handleEdit = (template: any) => {
    // Extract data from template for editing
    const headerComponent = template.components.find((c: any) => c.type === "HEADER");
    const bodyComponent = template.components.find((c: any) => c.type === "BODY");
    const footerComponent = template.components.find((c: any) => c.type === "FOOTER");

    setFormData({
      name: template.name + "_v2", // Meta doesn't allow editing, so we create a new version
      language: template.language,
      category: template.category,
      headerType: headerComponent?.format || "NONE",
      headerText: headerComponent?.text || "",
      bodyText: bodyComponent?.text || "",
      footerText: footerComponent?.text || "",
    });

    // Switch to create tab
    const createTab = document.querySelector('[value="create"]') as HTMLElement;
    createTab?.click();
    
    toast.info("Editing creates a new template version (Meta limitation)");
  };

  const quickSendTemplate = async (template: any, leadId: Id<"leads">) => {
    if (!leads || leads.length === 0) {
      toast.error("Loading contacts... Please try again.");
      return;
    }

    const lead = leads.find((l: any) => l._id === leadId);
    if (!lead) {
      toast.error("Contact not found");
      return;
    }

    try {
      await sendTemplateMessage({
        phoneNumber: lead.mobile,
        templateName: template.name,
        languageCode: template.language,
        leadId: lead._id,
      });
      toast.success(`Template "${template.name}" sent successfully`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send template");
    }
  };

  const handleSendTemplate = async () => {
    if (!selectedTemplate) {
      toast.error("No template selected");
      return;
    }

    // Use the leadId from sendFormData or fall back to selectedLeadId prop
    const targetLeadId = sendFormData.leadId || selectedLeadId;
    
    if (!targetLeadId) {
      toast.error("Please select a contact");
      return;
    }

    // Ensure leads are loaded
    if (!leads || leads.length === 0) {
      toast.error("Loading contacts...");
      return;
    }

    const lead = leads.find((l: any) => l._id === targetLeadId);
    if (!lead) {
      console.error("Lead not found:", { targetLeadId, availableLeads: leads.map((l: any) => l._id) });
      toast.error("Contact not found. Please try again.");
      return;
    }

    try {
      await sendTemplateMessage({
        phoneNumber: lead.mobile,
        templateName: selectedTemplate.name,
        languageCode: selectedTemplate.language,
        leadId: lead._id,
      });
      toast.success("Template message sent successfully");
      setSendDialogOpen(false);
      setSelectedTemplate(null);
      setSendFormData({ leadId: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send template");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "PENDING":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "REJECTED":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const insertFormatting = (format: string) => {
    const textarea = document.getElementById("body") as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = formData.bodyText.substring(start, end);
    
    let formattedText = "";
    switch (format) {
      case "bold":
        formattedText = `*${selectedText || "bold text"}*`;
        break;
      case "italic":
        formattedText = `_${selectedText || "italic text"}_`;
        break;
      case "strikethrough":
        formattedText = `~${selectedText || "strikethrough text"}~`;
        break;
      case "monospace":
        formattedText = `\`\`\`${selectedText || "monospace text"}\`\`\``;
        break;
    }

    const newText = formData.bodyText.substring(0, start) + formattedText + formData.bodyText.substring(end);
    setFormData({ ...formData, bodyText: newText });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            Templates
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>WhatsApp Message Templates</DialogTitle>
            <DialogDescription>
              Manage your WhatsApp message templates synced with Meta Business API
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="list">Templates ({templates.length})</TabsTrigger>
              <TabsTrigger value="create">Create New</TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={handleSync} disabled={isSyncing} size="sm">
                  <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
                  Sync from Meta
                </Button>
              </div>

              <div className="space-y-2">
                {templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates found. Click "Sync from Meta" or create a new template.
                  </div>
                ) : (
                  templates.map((template: any) => (
                    <div key={template._id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{template.name}</h4>
                          {getStatusIcon(template.status)}
                          <Badge variant={template.status === "APPROVED" ? "default" : "secondary"}>
                            {template.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{template.category}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              if (selectedLeadId) {
                                quickSendTemplate(template, selectedLeadId);
                              } else {
                                setSelectedTemplate(template);
                                setSendFormData({ leadId: "" });
                                setSendDialogOpen(true);
                              }
                            }}
                            title="Send template"
                            disabled={template.status !== "APPROVED"}
                          >
                            <SendIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(template)}
                            title="Edit template"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(template)}
                            title="Delete template"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">Language: {template.language}</p>
                      <div className="text-sm space-y-1">
                        {template.components.map((comp: any, idx: number) => (
                          <div key={idx} className="bg-muted/50 p-2 rounded">
                            <span className="font-medium text-xs">{comp.type}</span>
                            {comp.format && <span className="text-xs text-muted-foreground"> ({comp.format})</span>}
                            {": "}
                            <span className="text-xs">{comp.text || "(No text)"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="create" className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Templates must be approved by Meta before use. This typically takes 24-48 hours.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., welcome_message"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Use lowercase and underscores only</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <Select value={formData.language} onValueChange={(value) => setFormData({ ...formData, language: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en_US">English (US)</SelectItem>
                        <SelectItem value="en_GB">English (UK)</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="hi">Hindi</SelectItem>
                        <SelectItem value="ar">Arabic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MARKETING">Marketing</SelectItem>
                        <SelectItem value="UTILITY">Utility</SelectItem>
                        <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="headerType">Header Type</Label>
                  <Select value={formData.headerType} onValueChange={(value) => setFormData({ ...formData, headerType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      <SelectItem value="TEXT">Text</SelectItem>
                      <SelectItem value="IMAGE">Image</SelectItem>
                      <SelectItem value="VIDEO">Video</SelectItem>
                      <SelectItem value="DOCUMENT">Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.headerType === "TEXT" && (
                  <div className="space-y-2">
                    <Label htmlFor="header">Header Text</Label>
                    <Input
                      id="header"
                      placeholder="Header text (max 60 characters)"
                      maxLength={60}
                      value={formData.headerText}
                      onChange={(e) => setFormData({ ...formData, headerText: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">{formData.headerText.length}/60 characters</p>
                  </div>
                )}

                {(formData.headerType === "IMAGE" || formData.headerType === "VIDEO" || formData.headerType === "DOCUMENT") && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Media headers must be uploaded separately via Meta Business Manager after template creation.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="body">Body Text *</Label>
                  <div className="flex gap-2 mb-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertFormatting("bold")}
                      title="Bold"
                    >
                      <strong>B</strong>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertFormatting("italic")}
                      title="Italic"
                    >
                      <em>I</em>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertFormatting("strikethrough")}
                      title="Strikethrough"
                    >
                      <s>S</s>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => insertFormatting("monospace")}
                      title="Monospace"
                    >
                      <code>{"</>"}</code>
                    </Button>
                  </div>
                  <Textarea
                    id="body"
                    placeholder="Your message body... (max 1024 characters)"
                    rows={6}
                    maxLength={1024}
                    value={formData.bodyText}
                    onChange={(e) => setFormData({ ...formData, bodyText: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.bodyText.length}/1024 characters | Formatting: *bold* _italic_ ~strikethrough~ 
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="footer">Footer (Optional)</Label>
                  <Input
                    id="footer"
                    placeholder="Footer text"
                    value={formData.footerText}
                    onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
                  />
                </div>

                <Button onClick={handleCreate} disabled={isCreating} className="w-full">
                  {isCreating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Template
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Send Template Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Template Message</DialogTitle>
            <DialogDescription>
              {selectedLeadId 
                ? `Send "${selectedTemplate?.name}" to ${leads.find((l: any) => l._id === (sendFormData.leadId || selectedLeadId))?.name || "selected contact"}`
                : `Send "${selectedTemplate?.name}" to a contact`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedLeadId && (
              <div className="space-y-2">
                <Label htmlFor="lead">Select Contact</Label>
                <Select
                  value={sendFormData.leadId}
                  onValueChange={(value) => setSendFormData({ leadId: value as Id<"leads"> })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a contact..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((lead: any) => (
                      <SelectItem key={lead._id} value={lead._id}>
                        {lead.name} - {lead.mobile}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedLeadId && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  {leads.find((l: any) => l._id === selectedLeadId)?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {leads.find((l: any) => l._id === selectedLeadId)?.mobile}
                </p>
              </div>
            )}
            <Button onClick={handleSendTemplate} className="w-full">
              <SendIcon className="h-4 w-4 mr-2" />
              Send Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}