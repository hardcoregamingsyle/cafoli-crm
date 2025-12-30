import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Clock, Mail, MessageSquare, GitBranch, Shuffle, Tag, TagIcon, Filter, X, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Id } from "@/convex/_generated/dataModel";
import { Textarea } from "@/components/ui/textarea";

interface CampaignBlock {
  id: string;
  type: string;
  data: any;
  position: { x: number; y: number };
}

interface CampaignConnection {
  from: string;
  to: string;
  label?: string;
}

export default function CampaignBuilderPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<CampaignBlock[]>([]);
  const [connections, setConnections] = useState<CampaignConnection[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  
  // Lead selection state
  const [leadSelectionType, setLeadSelectionType] = useState<"all" | "filtered">("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [autoEnrollNew, setAutoEnrollNew] = useState(true);

  const allTags = useQuery(api.tags.getAllTags) || [];
  const uniqueSources = useQuery(api.leads.getUniqueSources) || [];
  const templates = useQuery(api.whatsappTemplatesQueries.getTemplates) || [];

  const createCampaign = useMutation(api.campaigns.createCampaign);
  const updateCampaign = useMutation(api.campaigns.updateCampaign);

  const availableStatuses = ["Cold", "Hot", "Mature"];

  const blockTypes = [
    { type: "wait", label: "Wait", icon: Clock, color: "bg-blue-500" },
    { type: "send_email", label: "Send Email", icon: Mail, color: "bg-green-500" },
    { type: "send_whatsapp", label: "Send WhatsApp", icon: MessageSquare, color: "bg-emerald-500" },
    { type: "conditional", label: "Conditional", icon: GitBranch, color: "bg-purple-500" },
    { type: "ab_test", label: "A/B Test", icon: Shuffle, color: "bg-orange-500" },
    { type: "add_tag", label: "Add Tag", icon: Tag, color: "bg-pink-500" },
    { type: "remove_tag", label: "Remove Tag", icon: TagIcon, color: "bg-red-500" },
    { type: "lead_condition", label: "Lead Condition", icon: Filter, color: "bg-indigo-500" },
  ];

  const addBlock = (type: string) => {
    const newBlock: CampaignBlock = {
      id: `block_${Date.now()}`,
      type,
      data: getDefaultBlockData(type),
      position: { x: 200 + blocks.length * 50, y: 100 + blocks.length * 100 },
    };
    setBlocks([...blocks, newBlock]);
    setShowBlockMenu(false);
    setSelectedBlock(newBlock.id);
  };

  const getDefaultBlockData = (type: string): any => {
    switch (type) {
      case "wait":
        return { duration: 1, unit: "hours" };
      case "send_email":
        return { subject: "", content: "", trackOpens: true, trackClicks: true };
      case "send_whatsapp":
        return { templateId: "", templateName: "" };
      case "conditional":
        return { condition: "email_opened", timeLimit: 24, timeLimitUnit: "hours", truePath: [], falsePath: [] };
      case "ab_test":
        return { splitPercentage: 50, pathA: [], pathB: [] };
      case "add_tag":
        return { tagId: "" };
      case "remove_tag":
        return { tagId: "" };
      case "lead_condition":
        return { condition: "has_tags", tagIds: [], timeValue: 1, timeUnit: "days", truePath: [], falsePath: [] };
      default:
        return {};
    }
  };

  const updateBlockData = (blockId: string, data: any) => {
    setBlocks(blocks.map(b => b.id === blockId ? { ...b, data: { ...b.data, ...data } } : b));
  };

  const removeBlock = (blockId: string) => {
    setBlocks(blocks.filter(b => b.id !== blockId));
    setConnections(connections.filter(c => c.from !== blockId && c.to !== blockId));
    if (selectedBlock === blockId) setSelectedBlock(null);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (blocks.length === 0) {
      toast.error("Add at least one block to the campaign");
      return;
    }

    try {
      const leadSelection = {
        type: leadSelectionType,
        tagIds: selectedTags.length > 0 ? selectedTags as Id<"tags">[] : undefined,
        statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
        sources: selectedSources.length > 0 ? selectedSources : undefined,
        autoEnrollNew,
      };

      if (campaignId) {
        await updateCampaign({
          campaignId: campaignId as Id<"campaigns">,
          name,
          description,
          leadSelection,
          blocks,
          connections,
        });
        toast.success("Campaign updated");
      } else {
        await createCampaign({
          name,
          description,
          type: "sequence",
          leadSelection,
          blocks,
          connections,
        });
        toast.success("Campaign created");
      }
      navigate("/campaigns");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save campaign");
    }
  };

  const selectedBlockData = blocks.find(b => b.id === selectedBlock);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">{campaignId ? "Edit Campaign" : "Create Campaign"}</h1>
                <p className="text-sm text-muted-foreground">Build your automated campaign flow</p>
              </div>
            </div>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save Campaign
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Campaign Settings & Block Palette */}
          <div className="lg:col-span-1 space-y-4">
            {/* Campaign Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Campaign Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Campaign" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
                </div>
              </CardContent>
            </Card>

            {/* Lead Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Lead Selection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Type</Label>
                  <Select value={leadSelectionType} onValueChange={(v: any) => setLeadSelectionType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Leads</SelectItem>
                      <SelectItem value="filtered">Filtered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {leadSelectionType === "filtered" && (
                  <div className="space-y-3 text-xs">
                    <div>
                      <Label className="text-xs">Tags</Label>
                      <Select onValueChange={(v) => !selectedTags.includes(v) && setSelectedTags([...selectedTags, v])}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allTags.map(tag => (
                            <SelectItem key={tag._id} value={tag._id}>{tag.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedTags.map(tagId => {
                          const tag = allTags.find(t => t._id === tagId);
                          return tag ? (
                            <span key={tagId} className="px-1.5 py-0.5 rounded text-xs flex items-center gap-1" style={{ backgroundColor: tag.color, color: 'white' }}>
                              {tag.name}
                              <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSelectedTags(selectedTags.filter(t => t !== tagId))} />
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Statuses</Label>
                      <Select onValueChange={(v) => !selectedStatuses.includes(v) && setSelectedStatuses([...selectedStatuses, v])}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableStatuses.map(status => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedStatuses.map(status => (
                          <span key={status} className="px-1.5 py-0.5 bg-secondary rounded text-xs flex items-center gap-1">
                            {status}
                            <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSelectedStatuses(selectedStatuses.filter(s => s !== status))} />
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Sources</Label>
                      <Select onValueChange={(v) => !selectedSources.includes(v) && setSelectedSources([...selectedSources, v])}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {uniqueSources.map(source => (
                            <SelectItem key={source} value={source}>{source}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedSources.map(source => (
                          <span key={source} className="px-1.5 py-0.5 bg-secondary rounded text-xs flex items-center gap-1">
                            {source}
                            <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSelectedSources(selectedSources.filter(s => s !== source))} />
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoEnrollNew}
                        onChange={(e) => setAutoEnrollNew(e.target.checked)}
                        className="rounded"
                      />
                      <Label className="text-xs">Auto-enroll new leads</Label>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Block Palette */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Add Blocks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {blockTypes.map(bt => (
                  <Button
                    key={bt.type}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => addBlock(bt.type)}
                  >
                    <bt.icon className="mr-2 h-3.5 w-3.5" />
                    {bt.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Center - Whiteboard Canvas */}
          <div className="lg:col-span-2">
            <Card className="h-[calc(100vh-12rem)]">
              <CardHeader className="border-b">
                <CardTitle className="text-sm">Campaign Flow</CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-full overflow-auto bg-muted/20">
                <div className="relative min-h-full min-w-full p-8">
                  {blocks.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <p className="text-sm">Add blocks from the left panel to start building your campaign</p>
                      </div>
                    </div>
                  ) : (
                    blocks.map((block, idx) => {
                      const blockType = blockTypes.find(bt => bt.type === block.type);
                      return (
                        <Card
                          key={block.id}
                          className={`absolute cursor-pointer transition-all ${selectedBlock === block.id ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'}`}
                          style={{ left: block.position.x, top: block.position.y, width: '200px' }}
                          onClick={() => setSelectedBlock(block.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {blockType && <blockType.icon className="h-4 w-4" />}
                                <span className="text-sm font-medium">{blockType?.label}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeBlock(block.id);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {block.type === "wait" && `${block.data.duration} ${block.data.unit}`}
                              {block.type === "send_email" && (block.data.subject || "No subject")}
                              {block.type === "send_whatsapp" && (block.data.templateName || "No template")}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar - Block Configuration */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="text-sm">Block Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedBlockData ? (
                  <div className="space-y-4">
                    <div className="text-sm font-medium mb-3">
                      {blockTypes.find(bt => bt.type === selectedBlockData.type)?.label}
                    </div>

                    {selectedBlockData.type === "wait" && (
                      <>
                        <div>
                          <Label className="text-xs">Duration</Label>
                          <Input
                            type="number"
                            className="h-8"
                            value={selectedBlockData.data.duration}
                            onChange={(e) => updateBlockData(selectedBlockData.id, { duration: parseInt(e.target.value) })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Unit</Label>
                          <Select
                            value={selectedBlockData.data.unit}
                            onValueChange={(v) => updateBlockData(selectedBlockData.id, { unit: v })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {selectedBlockData.type === "send_email" && (
                      <>
                        <div>
                          <Label className="text-xs">Subject</Label>
                          <Input
                            className="h-8"
                            value={selectedBlockData.data.subject}
                            onChange={(e) => updateBlockData(selectedBlockData.id, { subject: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Content</Label>
                          <Textarea
                            className="text-xs"
                            value={selectedBlockData.data.content}
                            onChange={(e) => updateBlockData(selectedBlockData.id, { content: e.target.value })}
                            rows={4}
                          />
                        </div>
                      </>
                    )}

                    {selectedBlockData.type === "send_whatsapp" && (
                      <div>
                        <Label className="text-xs">Template</Label>
                        <Select
                          value={selectedBlockData.data.templateId}
                          onValueChange={(v) => {
                            const template = templates.find(t => t._id === v);
                            updateBlockData(selectedBlockData.id, { templateId: v, templateName: template?.name });
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.filter(t => t.status === "APPROVED").map(template => (
                              <SelectItem key={template._id} value={template._id}>{template.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {(selectedBlockData.type === "add_tag" || selectedBlockData.type === "remove_tag") && (
                      <div>
                        <Label className="text-xs">Tag</Label>
                        <Select
                          value={selectedBlockData.data.tagId}
                          onValueChange={(v) => updateBlockData(selectedBlockData.id, { tagId: v })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {allTags.map(tag => (
                              <SelectItem key={tag._id} value={tag._id}>{tag.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Select a block to configure
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
