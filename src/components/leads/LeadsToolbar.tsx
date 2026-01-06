import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowUpDown, Filter } from "lucide-react";
import { CreateLeadDialog } from "./CreateLeadDialog";
import { Id } from "@/convex/_generated/dataModel";

interface LeadsToolbarProps {
  title: string;
  viewIrrelevantLeads: boolean;
  viewColdCallerLeads: boolean;
  isAdmin: boolean;
  filter: string;
  search: string;
  setSearch: (value: string) => void;
  sortBy: string;
  setSortBy: (value: string) => void;
  setFilterSidebarOpen: (open: boolean) => void;
  activeFilterCount: number;
  isCreateOpen: boolean;
  setIsCreateOpen: (open: boolean) => void;
  userId: Id<"users"> | undefined;
  onUnassignIdle: () => void;
  onToggleColdCallerView: () => void;
  onToggleIrrelevantView: () => void;
}

export function LeadsToolbar({
  title,
  viewIrrelevantLeads,
  viewColdCallerLeads,
  isAdmin,
  filter,
  search,
  setSearch,
  sortBy,
  setSortBy,
  setFilterSidebarOpen,
  activeFilterCount,
  isCreateOpen,
  setIsCreateOpen,
  userId,
  onUnassignIdle,
  onToggleColdCallerView,
  onToggleIrrelevantView,
}: LeadsToolbarProps) {
  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {viewIrrelevantLeads ? "Irrelevant Leads" : viewColdCallerLeads ? "Cold Caller Leads" : title}
          </h1>
          <p className="text-muted-foreground">
            Manage and track your leads
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {isAdmin && filter === "all" && (
            <>
              {viewColdCallerLeads && (
                <Button
                  variant="destructive"
                  onClick={onUnassignIdle}
                >
                  Unassign Idle Leads
                </Button>
              )}
              <Button
                variant={viewColdCallerLeads ? "default" : "outline"}
                onClick={onToggleColdCallerView}
                className="gap-2"
              >
                {viewColdCallerLeads ? "Show All Leads" : "Show Cold Caller Leads"}
              </Button>
              <Button
                variant={viewIrrelevantLeads ? "default" : "outline"}
                onClick={onToggleIrrelevantView}
                className="gap-2"
              >
                {viewIrrelevantLeads ? "Show All Leads" : "Show Irrelevant Leads"}
              </Button>
            </>
          )}
          <CreateLeadDialog 
            open={isCreateOpen} 
            onOpenChange={setIsCreateOpen} 
            userId={userId as Id<"users">} 
          />
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, company, subject, or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        
        <div className="flex gap-2">
          {/* Sort Dropdown */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px] md:w-[180px]">
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

          {/* Filter Button */}
          <Button 
            variant="outline" 
            onClick={() => setFilterSidebarOpen(true)}
            className="gap-2 flex-1 md:flex-none"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
