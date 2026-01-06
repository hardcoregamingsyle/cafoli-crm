import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { Doc } from "@/convex/_generated/dataModel";

interface ActiveFiltersDisplayProps {
  selectedStatuses: string[];
  setSelectedStatuses: (statuses: string[]) => void;
  selectedSources: string[];
  setSelectedSources: (sources: string[]) => void;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  selectedAssignedTo: string[];
  setSelectedAssignedTo: (users: string[]) => void;
  allTags: Doc<"tags">[];
  allUsers: Doc<"users">[];
}

export function ActiveFiltersDisplay({
  selectedStatuses,
  setSelectedStatuses,
  selectedSources,
  setSelectedSources,
  selectedTags,
  setSelectedTags,
  selectedAssignedTo,
  setSelectedAssignedTo,
  allTags,
  allUsers,
}: ActiveFiltersDisplayProps) {
  const hasActiveFilters = selectedStatuses.length > 0 || selectedSources.length > 0 || 
                          selectedTags.length > 0 || selectedAssignedTo.length > 0;

  if (!hasActiveFilters) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {selectedStatuses.map(status => (
        <Badge key={status} variant="secondary" className="gap-1">
          {status}
          <X 
            className="h-3 w-3 cursor-pointer" 
            onClick={() => setSelectedStatuses(selectedStatuses.filter(s => s !== status))}
          />
        </Badge>
      ))}
      {selectedSources.map(source => (
        <Badge key={source} variant="secondary" className="gap-1">
          {source}
          <X 
            className="h-3 w-3 cursor-pointer" 
            onClick={() => setSelectedSources(selectedSources.filter(s => s !== source))}
          />
        </Badge>
      ))}
      {selectedTags.map(tagId => {
        const tag = allTags.find(t => t._id === tagId);
        return tag ? (
          <Badge key={tagId} variant="secondary" className="gap-1" style={{ backgroundColor: tag.color, color: 'white' }}>
            {tag.name}
            <X 
              className="h-3 w-3 cursor-pointer" 
              onClick={() => setSelectedTags(selectedTags.filter(t => t !== tagId))}
            />
          </Badge>
        ) : null;
      })}
      {selectedAssignedTo.map(userId => {
        const u = allUsers.find(user => user._id === userId);
        return u ? (
          <Badge key={userId} variant="secondary" className="gap-1">
            👤 {u.name || u.email}
            <X 
              className="h-3 w-3 cursor-pointer" 
              onClick={() => setSelectedAssignedTo(selectedAssignedTo.filter(id => id !== userId))}
            />
          </Badge>
        ) : null;
      })}
    </div>
  );
}
