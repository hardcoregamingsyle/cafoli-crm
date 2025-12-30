import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

interface LeadSelectionPanelProps {
  leadSelectionType: "all" | "filtered";
  selectedTags: string[];
  selectedStatuses: string[];
  selectedSources: string[];
  autoEnrollNew: boolean;
  allTags: Array<{ _id: string; name: string; color: string }>;
  uniqueSources: string[];
  availableStatuses: string[];
  onLeadSelectionTypeChange: (type: "all" | "filtered") => void;
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onAddStatus: (status: string) => void;
  onRemoveStatus: (status: string) => void;
  onAddSource: (source: string) => void;
  onRemoveSource: (source: string) => void;
  onAutoEnrollChange: (autoEnroll: boolean) => void;
}

export function LeadSelectionPanel({
  leadSelectionType,
  selectedTags,
  selectedStatuses,
  selectedSources,
  autoEnrollNew,
  allTags,
  uniqueSources,
  availableStatuses,
  onLeadSelectionTypeChange,
  onAddTag,
  onRemoveTag,
  onAddStatus,
  onRemoveStatus,
  onAddSource,
  onRemoveSource,
  onAutoEnrollChange,
}: LeadSelectionPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Lead Selection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Type</Label>
          <Select value={leadSelectionType} onValueChange={(v: any) => onLeadSelectionTypeChange(v)}>
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
              <Select onValueChange={(v) => !selectedTags.includes(v) && onAddTag(v)}>
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
                      <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onRemoveTag(tagId)} />
                    </span>
                  ) : null;
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">Statuses</Label>
              <Select onValueChange={(v) => !selectedStatuses.includes(v) && onAddStatus(v)}>
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
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onRemoveStatus(status)} />
                  </span>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Sources</Label>
              <Select onValueChange={(v) => !selectedSources.includes(v) && onAddSource(v)}>
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
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => onRemoveSource(source)} />
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoEnrollNew}
                onChange={(e) => onAutoEnrollChange(e.target.checked)}
                className="rounded"
              />
              <Label className="text-xs">Auto-enroll new leads</Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
