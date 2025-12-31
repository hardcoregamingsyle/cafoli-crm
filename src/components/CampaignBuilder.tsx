import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Clock, Mail, MessageSquare, GitBranch, Shuffle, Tag, TagIcon, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Id } from "@/convex/_generated/dataModel";

interface CampaignBlock {
  id: string;
  type: string;
  data: any;
  position?: { x: number; y: number };
}

interface CampaignConnection {
  from: string;
  to: string;
  label?: string;
}

interface CampaignBuilderProps {
  campaignId?: Id<"campaigns">;
  onSave?: () => void;
}

export default function CampaignBuilder({ campaignId, onSave }: CampaignBuilderProps) {
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
  const uniqueSources = useQuery(api.leads.queries.getUniqueSources) || [];
  const templates = useQuery((api as any).whatsappTemplatesQueries?.getTemplates) || [];

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
      position: { x: 100, y: blocks.length * 150 + 100 },
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
    if (!user) {
      toast.error("You must be logged in to create a campaign");
      return;
    }
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
          userId: user._id,
          campaignId,
          name,
          description,
          leadSelection,
          blocks,
          connections,
        });
        toast.success("Campaign updated");
      } else {
        await createCampaign({
          userId: user._id,
          name,
          description,
          type: "sequence",
          leadSelection,
          blocks,
          connections,
        });
        toast.success("Campaign created");
      }
      onSave?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save campaign");
    }
  };

  const selectedBlockData = blocks.find(b => b.id === selectedBlock);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Campaign Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Campaign" />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
        </div>

        {/* Lead Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lead Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Selection Type</Label>
              <Select value={leadSelectionType} onValueChange={(v: any) => setLeadSelectionType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Leads</SelectItem>
                  <SelectItem value="filtered">Filtered Leads</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {leadSelectionType === "filtered" && (
              <div className="space-y-3">
                <div>
                  <Label>Tags</Label>
                  <Select onValueChange={(v) => !selectedTags.includes(v) && setSelectedTags([...selectedTags, v])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tags..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allTags.map(tag => (
                        <SelectItem key={tag._id} value={tag._id}>{tag.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedTags.map(tagId => {
                      const tag = allTags.find(t => t._id === tagId);
                      return tag ? (
                        <span key={tagId} className="px-2 py-1 rounded text-xs flex items-center gap-1" style={{ backgroundColor: tag.color, color: 'white' }}>
                          {tag.name}
                          <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedTags(selectedTags.filter(t => t !== tagId))} />
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>

                <div>
                  <Label>Statuses</Label>
                  <Select onValueChange={(v) => !selectedStatuses.includes(v) && setSelectedStatuses([...selectedStatuses, v])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select statuses..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStatuses.map(status => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedStatuses.map(status => (
                      <span key={status} className="px-2 py-1 bg-secondary rounded text-xs flex items-center gap-1">
                        {status}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedStatuses(selectedStatuses.filter(s => s !== status))} />
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Sources</Label>
                  <Select onValueChange={(v) => !selectedSources.includes(v) && setSelectedSources([...selectedSources, v])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sources..." />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueSources.map(source => (
                        <SelectItem key={source} value={source}>{source}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedSources.map(source => (
                      <span key={source} className="px-2 py-1 bg-secondary rounded text-xs flex items-center gap-1">
                        {source}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedSources(selectedSources.filter(s => s !== source))} />
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
                  <Label>Auto-enroll new leads matching criteria</Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Flow Builder */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4">
        {/* Block List */}
        <div className="w-full lg:w-64 space-y-2">
          <Button onClick={() => setShowBlockMenu(!showBlockMenu)} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add Block
          </Button>

          {showBlockMenu && (
            <Card>
              <CardContent className="p-2 space-y-1">
                {blockTypes.map(bt => (
                  <Button
                    key={bt.type}
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => addBlock(bt.type)}
                  >
                    <bt.icon className="mr-2 h-4 w-4" />
                    {bt.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {blocks.map((block, idx) => {
              const blockType = blockTypes.find(bt => bt.type === block.type);
              return (
                <Card
                  key={block.id}
                  className={`cursor-pointer ${selectedBlock === block.id ? 'border-primary' : ''}`}
                  onClick={() => setSelectedBlock(block.id)}
                >
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {blockType && <blockType.icon className="h-4 w-4" />}
                      <span className="text-sm">{blockType?.label} {idx + 1}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBlock(block.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Block Editor */}
        <div className="flex-1 min-w-0">
          {selectedBlockData ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {blockTypes.find(bt => bt.type === selectedBlockData.type)?.label} Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedBlockData.type === "wait" && (
                  <>
                    <div>
                      <Label>Duration</Label>
                      <Input
                        type="number"
                        value={selectedBlockData.data.duration}
                        onChange={(e) => updateBlockData(selectedBlockData.id, { duration: parseInt(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Unit</Label>
                      <Select
                        value={selectedBlockData.data.unit}
                        onValueChange={(v) => updateBlockData(selectedBlockData.id, { unit: v })}
                      >
                        <SelectTrigger>
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
                      <Label>Subject</Label>
                      <Input
                        value={selectedBlockData.data.subject}
                        onChange={(e) => updateBlockData(selectedBlockData.id, { subject: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Content</Label>
                      <Textarea
                        value={selectedBlockData.data.content}
                        onChange={(e) => updateBlockData(selectedBlockData.id, { content: e.target.value })}
                        rows={6}
                      />
                    </div>
                  </>
                )}

                {selectedBlockData.type === "send_whatsapp" && (
                  <div>
                    <Label>WhatsApp Template</Label>
                    <Select
                      value={selectedBlockData.data.templateId}
                      onValueChange={(v) => {
                        const template = templates.find((t: any) => t._id === v);
                        updateBlockData(selectedBlockData.id, { templateId: v, templateName: template?.name });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.filter((t: any) => t.status === "APPROVED").map((template: any) => (
                          <SelectItem key={template._id} value={template._id}>{template.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(selectedBlockData.type === "add_tag" || selectedBlockData.type === "remove_tag") && (
                  <div>
                    <Label>Tag</Label>
                    <Select
                      value={selectedBlockData.data.tagId}
                      onValueChange={(v) => updateBlockData(selectedBlockData.id, { tagId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select tag..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allTags.map(tag => (
                          <SelectItem key={tag._id} value={tag._id}>{tag.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedBlockData.type === "conditional" && (
                  <>
                    <div>
                      <Label>Condition</Label>
                      <Select
                        value={selectedBlockData.data.condition}
                        onValueChange={(v) => updateBlockData(selectedBlockData.id, { condition: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email_opened">Email Opened</SelectItem>
                          <SelectItem value="email_replied">Email Replied</SelectItem>
                          <SelectItem value="email_link_clicked">Email Link Clicked</SelectItem>
                          <SelectItem value="whatsapp_read">WhatsApp Read</SelectItem>
                          <SelectItem value="whatsapp_replied">WhatsApp Replied</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Time Limit</Label>
                        <Input
                          type="number"
                          value={selectedBlockData.data.timeLimit}
                          onChange={(e) => updateBlockData(selectedBlockData.id, { timeLimit: parseInt(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label>Unit</Label>
                        <Select
                          value={selectedBlockData.data.timeLimitUnit}
                          onValueChange={(v) => updateBlockData(selectedBlockData.id, { timeLimitUnit: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutes</SelectItem>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}

                {selectedBlockData.type === "ab_test" && (
                  <div>
                    <Label>Split Percentage (Path A)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={selectedBlockData.data.splitPercentage}
                      onChange={(e) => updateBlockData(selectedBlockData.id, { splitPercentage: parseInt(e.target.value) })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Path B will receive {100 - selectedBlockData.data.splitPercentage}%
                    </p>
                  </div>
                )}

                {selectedBlockData.type === "lead_condition" && (
                  <>
                    <div>
                      <Label>Condition</Label>
                      <Select
                        value={selectedBlockData.data.condition}
                        onValueChange={(v) => updateBlockData(selectedBlockData.id, { condition: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="has_tags">Has Specific Tags</SelectItem>
                          <SelectItem value="overdue_followup">Has Overdue Follow-up</SelectItem>
                          <SelectItem value="followup_in_more_than">Follow-up in More Than</SelectItem>
                          <SelectItem value="followup_in_less_than">Follow-up in Less Than</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedBlockData.data.condition === "has_tags" && (
                      <div>
                        <Label>Tags</Label>
                        <Select onValueChange={(v) => {
                          const current = selectedBlockData.data.tagIds || [];
                          if (!current.includes(v)) {
                            updateBlockData(selectedBlockData.id, { tagIds: [...current, v] });
                          }
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tags..." />
                          </SelectTrigger>
                          <SelectContent>
                            {allTags.map(tag => (
                              <SelectItem key={tag._id} value={tag._id}>{tag.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {(selectedBlockData.data.condition === "followup_in_more_than" || 
                      selectedBlockData.data.condition === "followup_in_less_than") && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Time Value</Label>
                          <Input
                            type="number"
                            value={selectedBlockData.data.timeValue || 1}
                            onChange={(e) => updateBlockData(selectedBlockData.id, { timeValue: parseInt(e.target.value) })}
                          />
                        </div>
                        <div>
                          <Label>Unit</Label>
                          <Select
                            value={selectedBlockData.data.timeUnit || "days"}
                            onValueChange={(v) => updateBlockData(selectedBlockData.id, { timeUnit: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a block to configure
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onSave?.()}>Cancel</Button>
        <Button onClick={handleSave}>Save Campaign</Button>
      </div>
    </div>
  );
}