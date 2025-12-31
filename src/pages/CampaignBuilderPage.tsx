import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Id } from "@/convex/_generated/dataModel";
import { BlockPalette, blockTypes } from "@/components/campaign-builder/BlockPalette";
import { CampaignSettings } from "@/components/campaign-builder/CampaignSettings";
import { LeadSelectionPanel } from "@/components/campaign-builder/LeadSelectionPanel";
import { CampaignCanvas } from "@/components/campaign-builder/CampaignCanvas";
import { BlockConfigurationPanel } from "@/components/campaign-builder/BlockConfigurationPanel";
import { CampaignBlock, CampaignConnection } from "@/types/campaign";

export default function CampaignBuilderPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<CampaignBlock[]>([]);
  const [connections, setConnections] = useState<CampaignConnection[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  
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
            <CampaignCanvas
              blocks={blocks}
              connections={connections}
              blockTypes={blockTypes}
              selectedBlock={selectedBlock}
              connectingFrom={connectingFrom}
              onBlocksChange={setBlocks}
              onConnectionsChange={setConnections}
              onSelectBlock={setSelectedBlock}
              onConnectingFromChange={setConnectingFrom}
            />
          </div>

          {/* Right Sidebar - Block Configuration */}
          <div className="lg:col-span-1">
            <BlockConfigurationPanel
              selectedBlock={selectedBlockData}
              blockTypes={blockTypes}
              templates={templates}
              allTags={allTags}
              onUpdateBlockData={updateBlockData}
            />
          </div>
        </div>
      </div>
    </div>
  );
}