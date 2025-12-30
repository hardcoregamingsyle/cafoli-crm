import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitBranch, X, ArrowLeft, Save, Move } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Id } from "@/convex/_generated/dataModel";
import { Textarea } from "@/components/ui/textarea";
import { BlockPalette, blockTypes } from "@/components/campaign-builder/BlockPalette";
import { CampaignSettings } from "@/components/campaign-builder/CampaignSettings";
import { LeadSelectionPanel } from "@/components/campaign-builder/LeadSelectionPanel";

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
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  
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
    
    // Auto-connect to previous block if exists
    if (blocks.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      setConnections([...connections, { from: lastBlock.id, to: newBlock.id }]);
    }
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

  const addConnection = (fromId: string, toId: string) => {
    // Prevent duplicate connections
    if (connections.some(c => c.from === fromId && c.to === toId)) {
      toast.error("Connection already exists");
      return;
    }
    // Prevent self-connections
    if (fromId === toId) {
      toast.error("Cannot connect a block to itself");
      return;
    }
    setConnections([...connections, { from: fromId, to: toId }]);
    toast.success("Connection created");
  };

  const removeConnection = (fromId: string, toId: string) => {
    setConnections(connections.filter(c => !(c.from === fromId && c.to === toId)));
    toast.success("Connection removed");
  };

  const handleBlockConnect = (blockId: string) => {
    if (connectingFrom === null) {
      setConnectingFrom(blockId);
      toast.info("Select target block to connect");
    } else {
      addConnection(connectingFrom, blockId);
      setConnectingFrom(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, blockId: string) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setDraggingBlock(blockId);
    setSelectedBlock(blockId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingBlock || !canvasRef.current) return;
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const newX = e.clientX - canvasRect.left - dragOffset.x;
    const newY = e.clientY - canvasRect.top - dragOffset.y;
    
    setBlocks(blocks.map(b => 
      b.id === draggingBlock 
        ? { ...b, position: { x: Math.max(0, newX), y: Math.max(0, newY) } }
        : b
    ));
  };

  const handleMouseUp = () => {
    setDraggingBlock(null);
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
      navigate("/campaigns");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save campaign");
    }
  };

  // Draw connections on canvas
  const renderConnections = () => {
    return connections.map((conn, idx) => {
      const fromBlock = blocks.find(b => b.id === conn.from);
      const toBlock = blocks.find(b => b.id === conn.to);
      
      if (!fromBlock || !toBlock) return null;
      
      const fromX = fromBlock.position.x + 100;
      const fromY = fromBlock.position.y + 60;
      const toX = toBlock.position.x + 100;
      const toY = toBlock.position.y;
      
      const midX = fromX;
      const midY = (fromY + toY) / 2;
      
      return (
        <g key={`conn-${idx}`}>
          <defs>
            <marker
              id={`arrowhead-${idx}`}
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="hsl(var(--primary))" />
            </marker>
          </defs>
          <path
            d={`M ${fromX} ${fromY} Q ${midX} ${midY}, ${toX} ${toY}`}
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            fill="none"
            markerEnd={`url(#arrowhead-${idx})`}
            className="cursor-pointer hover:stroke-destructive transition-colors"
            style={{ pointerEvents: 'stroke' }}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this connection?")) {
                removeConnection(conn.from, conn.to);
              }
            }}
          />
          {conn.label && (
            <text
              x={midX}
              y={midY}
              fill="hsl(var(--primary))"
              fontSize="12"
              textAnchor="middle"
              className="pointer-events-none"
            >
              {conn.label}
            </text>
          )}
        </g>
      );
    });
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
            <CampaignSettings
              name={name}
              description={description}
              onNameChange={setName}
              onDescriptionChange={setDescription}
            />

            <LeadSelectionPanel
              leadSelectionType={leadSelectionType}
              selectedTags={selectedTags}
              selectedStatuses={selectedStatuses}
              selectedSources={selectedSources}
              autoEnrollNew={autoEnrollNew}
              allTags={allTags}
              uniqueSources={uniqueSources}
              availableStatuses={availableStatuses}
              onLeadSelectionTypeChange={setLeadSelectionType}
              onAddTag={(tagId) => setSelectedTags([...selectedTags, tagId])}
              onRemoveTag={(tagId) => setSelectedTags(selectedTags.filter(t => t !== tagId))}
              onAddStatus={(status) => setSelectedStatuses([...selectedStatuses, status])}
              onRemoveStatus={(status) => setSelectedStatuses(selectedStatuses.filter(s => s !== status))}
              onAddSource={(source) => setSelectedSources([...selectedSources, source])}
              onRemoveSource={(source) => setSelectedSources(selectedSources.filter(s => s !== source))}
              onAutoEnrollChange={setAutoEnrollNew}
            />

            <BlockPalette onAddBlock={addBlock} />
          </div>

          {/* Center - Whiteboard Canvas */}
          <div className="lg:col-span-2">
            <Card className="h-[calc(100vh-12rem)]">
              <CardHeader className="border-b">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Move className="h-4 w-4" />
                  Campaign Flow (Drag blocks to arrange)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-full overflow-auto bg-muted/20">
                <div 
                  ref={canvasRef}
                  className="relative min-h-full min-w-full p-8"
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <svg
                    className="absolute top-0 left-0 pointer-events-none"
                    style={{ width: '100%', height: '100%', zIndex: 0 }}
                  >
                    {renderConnections()}
                  </svg>
                  
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
                          className={`absolute cursor-move transition-all ${
                            selectedBlock === block.id ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'
                          } ${draggingBlock === block.id ? 'opacity-70' : ''}`}
                          style={{ 
                            left: block.position.x, 
                            top: block.position.y, 
                            width: '200px',
                            zIndex: selectedBlock === block.id ? 10 : 1
                          }}
                          onMouseDown={(e) => handleMouseDown(e, block.id)}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {blockType && <blockType.icon className="h-4 w-4" />}
                                <span className="text-sm font-medium">{blockType?.label}</span>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={`h-6 w-6 p-0 ${connectingFrom === block.id ? 'bg-primary text-primary-foreground' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleBlockConnect(block.id);
                                  }}
                                  title={connectingFrom === block.id ? "Select target" : "Connect to another block"}
                                >
                                  <GitBranch className="h-3 w-3" />
                                </Button>
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
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {block.type === "wait" && `${block.data.duration} ${block.data.unit}`}
                              {block.type === "send_email" && (block.data.subject || "No subject")}
                              {block.type === "send_whatsapp" && (block.data.templateName || "No template")}
                              {block.type === "conditional" && (
                                <div className="text-[10px]">
                                  ✓ {block.data.truePath?.length || 0} | ✗ {block.data.falsePath?.length || 0}
                                </div>
                              )}
                              {block.type === "ab_test" && (
                                <div className="text-[10px]">
                                  A: {block.data.splitPercentage}% | B: {100 - block.data.splitPercentage}%
                                </div>
                              )}
                              {block.type === "lead_condition" && (
                                <div className="text-[10px]">
                                  ✓ {block.data.truePath?.length || 0} | ✗ {block.data.falsePath?.length || 0}
                                </div>
                              )}
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