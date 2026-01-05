import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BlockType } from "./BlockPalette";
import { CampaignBlock } from "@/types/campaign";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface BlockConfigurationPanelProps {
  selectedBlock: CampaignBlock | undefined;
  blockTypes: BlockType[];
  templates: any[];
  allTags: any[];
  onUpdateBlockData: (blockId: string, data: any) => void;
}

export function BlockConfigurationPanel({
  selectedBlock,
  blockTypes,
  templates,
  allTags,
  onUpdateBlockData,
}: BlockConfigurationPanelProps) {
  const { user } = useAuth();
  const generateAi = useAction(api.ai.generate);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAiGenerateEmail = async () => {
    if (!selectedBlock || !user) return;
    
    const subject = selectedBlock.data.subject;
    if (!subject) {
      toast.error("Please enter a subject first to generate content");
      return;
    }

    setIsGenerating(true);
    try {
      const content = await generateAi({
        prompt: `Write an email body for the subject: ${subject}`,
        systemPrompt: "You are an expert copywriter for email campaigns.",
      });

      onUpdateBlockData(selectedBlock.id, { content });
      toast.success("Email content generated");
    } catch (error) {
      toast.error("Failed to generate content");
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="sticky top-24">
      <CardHeader>
        <CardTitle className="text-sm">Block Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        {selectedBlock ? (
          <div className="space-y-4">
            <div className="text-sm font-medium mb-3">
              {blockTypes.find(bt => bt.type === selectedBlock.type)?.label}
            </div>

            {selectedBlock.type === "wait" && (
              <>
                <div>
                  <Label className="text-xs">Duration</Label>
                  <Input
                    type="number"
                    className="h-8"
                    value={selectedBlock.data.duration}
                    onChange={(e) => onUpdateBlockData(selectedBlock.id, { duration: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Select
                    value={selectedBlock.data.unit}
                    onValueChange={(v) => onUpdateBlockData(selectedBlock.id, { unit: v })}
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

            {selectedBlock.type === "send_email" && (
              <>
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input
                    className="h-8"
                    value={selectedBlock.data.subject}
                    onChange={(e) => onUpdateBlockData(selectedBlock.id, { subject: e.target.value })}
                    placeholder="Enter email subject..."
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Content</Label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                      onClick={handleAiGenerateEmail}
                      disabled={isGenerating || !selectedBlock.data.subject}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      {isGenerating ? "Writing..." : "AI Write"}
                    </Button>
                  </div>
                  <Textarea
                    className="text-xs"
                    value={selectedBlock.data.content}
                    onChange={(e) => onUpdateBlockData(selectedBlock.id, { content: e.target.value })}
                    rows={8}
                    placeholder="Email body content..."
                  />
                </div>
              </>
            )}

            {selectedBlock.type === "send_whatsapp" && (
              <div>
                <Label className="text-xs">Template</Label>
                <Select
                  value={selectedBlock.data.templateId}
                  onValueChange={(v) => {
                    const template = templates.find(t => t._id === v);
                    onUpdateBlockData(selectedBlock.id, { templateId: v, templateName: template?.name });
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

            {(selectedBlock.type === "add_tag" || selectedBlock.type === "remove_tag") && (
              <div>
                <Label className="text-xs">Tag</Label>
                <Select
                  value={selectedBlock.data.tagId}
                  onValueChange={(v) => onUpdateBlockData(selectedBlock.id, { tagId: v })}
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
  );
}