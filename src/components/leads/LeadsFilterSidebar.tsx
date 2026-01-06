import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Doc } from "@/convex/_generated/dataModel";
import { X, Filter } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FilterSection } from "./FilterSection";
import { FilterCheckboxItem } from "./FilterCheckboxItem";

interface LeadsFilterSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStatuses: string[];
  setSelectedStatuses: (v: string[]) => void;
  selectedSources: string[];
  setSelectedSources: (v: string[]) => void;
  selectedTags: string[];
  setSelectedTags: (v: string[]) => void;
  selectedAssignedTo: string[];
  setSelectedAssignedTo: (v: string[]) => void;
  allTags: Doc<"tags">[];
  uniqueSources: string[];
  allUsers: Doc<"users">[];
  isAdmin: boolean;
  availableStatuses: string[];
}

export function LeadsFilterSidebar({
  open,
  onOpenChange,
  selectedStatuses,
  setSelectedStatuses,
  selectedSources,
  setSelectedSources,
  selectedTags,
  setSelectedTags,
  selectedAssignedTo,
  setSelectedAssignedTo,
  allTags,
  uniqueSources,
  allUsers,
  isAdmin,
  availableStatuses,
}: LeadsFilterSidebarProps) {
  
  const toggleFilter = (value: string, currentFilters: string[], setFilters: (filters: string[]) => void) => {
    if (currentFilters.includes(value)) {
      setFilters(currentFilters.filter(f => f !== value));
    } else {
      setFilters([...currentFilters, value]);
    }
  };

  const clearAllFilters = () => {
    setSelectedStatuses([]);
    setSelectedSources([]);
    setSelectedTags([]);
    setSelectedAssignedTo([]);
  };

  const hasActiveFilters = selectedStatuses.length > 0 || selectedSources.length > 0 || 
                          selectedTags.length > 0 || selectedAssignedTo.length > 0;

  const activeFilterCount = selectedStatuses.length + selectedSources.length + 
                           selectedTags.length + selectedAssignedTo.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFilterCount} active
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Filter leads by status, source, tags, and assignment
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-140px)] mt-6 pr-4">
          <div className="space-y-6">
            {/* Status Filter */}
            <FilterSection
              title="Status"
              hasActiveFilters={selectedStatuses.length > 0}
              onClear={() => setSelectedStatuses([])}
            >
              {availableStatuses.map((status) => (
                <FilterCheckboxItem
                  key={status}
                  id={`status-${status}`}
                  checked={selectedStatuses.includes(status)}
                  onCheckedChange={() => toggleFilter(status, selectedStatuses, setSelectedStatuses)}
                  label={status}
                />
              ))}
            </FilterSection>

            <Separator />

            {/* Source Filter */}
            <FilterSection
              title="Source"
              hasActiveFilters={selectedSources.length > 0}
              onClear={() => setSelectedSources([])}
            >
              {uniqueSources.map((source) => (
                <FilterCheckboxItem
                  key={source}
                  id={`source-${source}`}
                  checked={selectedSources.includes(source)}
                  onCheckedChange={() => toggleFilter(source, selectedSources, setSelectedSources)}
                  label={source}
                />
              ))}
            </FilterSection>

            <Separator />

            {/* Tags Filter */}
            <FilterSection
              title="Tags"
              hasActiveFilters={selectedTags.length > 0}
              onClear={() => setSelectedTags([])}
            >
              {allTags.map((tag) => (
                <FilterCheckboxItem
                  key={tag._id}
                  id={`tag-${tag._id}`}
                  checked={selectedTags.includes(tag._id)}
                  onCheckedChange={() => toggleFilter(tag._id, selectedTags, setSelectedTags)}
                  label={
                    <span className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </span>
                  }
                />
              ))}
            </FilterSection>

            {/* Assigned To Filter (Admin Only) */}
            {isAdmin && (
              <>
                <Separator />
                <FilterSection
                  title="Assigned To"
                  hasActiveFilters={selectedAssignedTo.length > 0}
                  onClear={() => setSelectedAssignedTo([])}
                >
                  {allUsers.map((user) => (
                    <FilterCheckboxItem
                      key={user._id}
                      id={`user-${user._id}`}
                      checked={selectedAssignedTo.includes(user._id)}
                      onCheckedChange={() => toggleFilter(user._id, selectedAssignedTo, setSelectedAssignedTo)}
                      label={user.name || user.email}
                    />
                  ))}
                </FilterSection>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer with Clear All */}
        {hasActiveFilters && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
            <Button 
              variant="outline" 
              onClick={clearAllFilters}
              className="w-full"
            >
              <X className="mr-2 h-4 w-4" />
              Clear All Filters
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}