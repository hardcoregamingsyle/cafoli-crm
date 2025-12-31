import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BlockType } from "./BlockPalette";
import { CampaignBlock } from "@/types/campaign";

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
                  />
                </div>
                <div>
                  <Label className="text-xs">Content</Label>
                  <Textarea
                    className="text-xs"
                    value={selectedBlock.data.content}
                    onChange={(e) => onUpdateBlockData(selectedBlock.id, { content: e.target.value })}
                    rows={4}
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
