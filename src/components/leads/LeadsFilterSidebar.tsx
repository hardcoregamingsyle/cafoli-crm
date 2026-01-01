import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Doc } from "@/convex/_generated/dataModel";
import { X, Filter } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Status</Label>
                {selectedStatuses.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedStatuses([])}
                    className="h-auto p-1 text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {availableStatuses.map((status) => (
                  <div key={status} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${status}`}
                      checked={selectedStatuses.includes(status)}
                      onCheckedChange={() => toggleFilter(status, selectedStatuses, setSelectedStatuses)}
                    />
                    <Label
                      htmlFor={`status-${status}`}
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {status}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Source Filter */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Source</Label>
                {selectedSources.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSources([])}
                    className="h-auto p-1 text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {uniqueSources.map((source) => (
                  <div key={source} className="flex items-center space-x-2">
                    <Checkbox
                      id={`source-${source}`}
                      checked={selectedSources.includes(source)}
                      onCheckedChange={() => toggleFilter(source, selectedSources, setSelectedSources)}
                    />
                    <Label
                      htmlFor={`source-${source}`}
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {source}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Tags Filter */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Tags</Label>
                {selectedTags.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTags([])}
                    className="h-auto p-1 text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {allTags.map((tag) => (
                  <div key={tag._id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tag-${tag._id}`}
                      checked={selectedTags.includes(tag._id)}
                      onCheckedChange={() => toggleFilter(tag._id, selectedTags, setSelectedTags)}
                    />
                    <Label
                      htmlFor={`tag-${tag._id}`}
                      className="text-sm font-normal cursor-pointer flex-1 flex items-center gap-2"
                    >
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Assigned To Filter (Admin Only) */}
            {isAdmin && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-semibold">Assigned To</Label>
                    {selectedAssignedTo.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedAssignedTo([])}
                        className="h-auto p-1 text-xs"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {allUsers.map((user) => (
                      <div key={user._id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`user-${user._id}`}
                          checked={selectedAssignedTo.includes(user._id)}
                          onCheckedChange={() => toggleFilter(user._id, selectedAssignedTo, setSelectedAssignedTo)}
                        />
                        <Label
                          htmlFor={`user-${user._id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {user.name || user.email}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
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
