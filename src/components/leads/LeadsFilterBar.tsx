import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Doc } from "@/convex/_generated/dataModel";
import { Check, ChevronsUpDown, X, ArrowUpDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LeadsFilterBarProps {
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
  sortBy: string;
  setSortBy: (v: string) => void;
}

export function LeadsFilterBar({
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
  sortBy,
  setSortBy
}: LeadsFilterBarProps) {
  
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center flex-wrap overflow-x-auto pb-2">
        {/* Sort Dropdown */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="mr-2 h-4 w-4 opacity-50" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="next_followup">Next Follow-up</SelectItem>
            <SelectItem value="last_contacted">Last Contacted</SelectItem>
          </SelectContent>
        </Select>

        <div className="h-8 w-[1px] bg-border mx-1" />

        {/* Status Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between">
              Status {selectedStatuses.length > 0 && `(${selectedStatuses.length})`}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search status..." />
              <CommandList>
                <CommandEmpty>No status found.</CommandEmpty>
                <CommandGroup>
                  {availableStatuses.map((status) => (
                    <CommandItem
                      key={status}
                      value={status}
                      onSelect={() => toggleFilter(status, selectedStatuses, setSelectedStatuses)}
                    >
                      <span className="flex-1">{status}</span>
                      {selectedStatuses.includes(status) && (
                        <Check className="h-4 w-4 ml-auto" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Source Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between">
              Source {selectedSources.length > 0 && `(${selectedSources.length})`}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search source..." />
              <CommandList>
                <CommandEmpty>No source found.</CommandEmpty>
                <CommandGroup>
                  {uniqueSources.map((source) => (
                    <CommandItem
                      key={source}
                      value={source}
                      onSelect={() => toggleFilter(source, selectedSources, setSelectedSources)}
                    >
                      <span className="flex-1">{source}</span>
                      {selectedSources.includes(source) && (
                        <Check className="h-4 w-4 ml-auto" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Tag Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-between">
              Tags {selectedTags.length > 0 && `(${selectedTags.length})`}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search tags..." />
              <CommandList>
                <CommandEmpty>No tags found.</CommandEmpty>
                <CommandGroup>
                  {allTags.map((tag) => (
                    <CommandItem
                      key={tag._id}
                      value={tag.name}
                      onSelect={() => toggleFilter(tag._id, selectedTags, setSelectedTags)}
                    >
                      <div 
                        className="w-3 h-3 rounded-full mr-2" 
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="flex-1">{tag.name}</span>
                      {selectedTags.includes(tag._id) && (
                        <Check className="h-4 w-4 ml-auto" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Assigned To Filter (Admin Only) */}
        {isAdmin && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-between">
                Assigned To {selectedAssignedTo.length > 0 && `(${selectedAssignedTo.length})`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <Command>
                <CommandInput placeholder="Search users..." />
                <CommandList>
                  <CommandEmpty>No users found.</CommandEmpty>
                  <CommandGroup>
                    {allUsers.map((u) => (
                      <CommandItem
                        key={u._id}
                        value={u.name || u.email || ""}
                        onSelect={() => toggleFilter(u._id, selectedAssignedTo, setSelectedAssignedTo)}
                      >
                        <span className="flex-1">{u.name || u.email}</span>
                        {selectedAssignedTo.includes(u._id) && (
                          <Check className="h-4 w-4 ml-auto" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        {/* Clear All Filters */}
        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAllFilters}
            className="h-9 px-3"
          >
            Clear All
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {selectedStatuses.map(status => (
            <Badge key={status} variant="secondary" className="gap-1">
              {status}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => toggleFilter(status, selectedStatuses, setSelectedStatuses)}
              />
            </Badge>
          ))}
          {selectedSources.map(source => (
            <Badge key={source} variant="secondary" className="gap-1">
              {source}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => toggleFilter(source, selectedSources, setSelectedSources)}
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
                  onClick={() => toggleFilter(tagId, selectedTags, setSelectedTags)}
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
                  onClick={() => toggleFilter(userId, selectedAssignedTo, setSelectedAssignedTo)}
                />
              </Badge>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}