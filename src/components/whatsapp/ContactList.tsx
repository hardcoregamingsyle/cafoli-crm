import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Id } from "@/convex/_generated/dataModel";
import { Search, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ContactListProps {
  leads: any[];
  selectedLeadId: Id<"leads"> | null;
  onSelectLead: (id: Id<"leads">) => void;
  onLoadMore: () => void;
  canLoadMore: boolean;
  isLoading: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function ContactList({
  leads,
  selectedLeadId,
  onSelectLead,
  onLoadMore,
  canLoadMore,
  isLoading,
  searchQuery,
  onSearchChange,
}: ContactListProps) {
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [unreadFilter, setUnreadFilter] = useState<string>("all");
  // Sentinel placed at 80% of list to prefetch next page
  const prefetchRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const isControlled = onSearchChange !== undefined;
  const currentSearchQuery = isControlled ? (searchQuery || "") : internalSearchQuery;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (isControlled && onSearchChange) {
      onSearchChange(val);
    } else {
      setInternalSearchQuery(val);
    }
  };

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(currentSearchQuery.toLowerCase()) ||
      lead.mobile.includes(currentSearchQuery);

    if (unreadFilter === "unread") {
      return matchesSearch && lead.unreadCount > 0;
    }
    return matchesSearch;
  });

  // Prefetch sentinel — triggers at 80% scroll depth
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    const el = prefetchRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [canLoadMore, isLoading, onLoadMore]);

  // Bottom sentinel — fallback trigger
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    const el = loadMoreRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [canLoadMore, isLoading, onLoadMore]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Index at which to place the prefetch sentinel (80% of list)
  const prefetchIndex = Math.max(0, Math.floor(filteredLeads.length * 0.8) - 1);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-transparent">
      <div className="p-3 border-b flex-shrink-0 space-y-3 bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-9 bg-muted/50 border-none focus-visible:ring-1"
            value={currentSearchQuery}
            onChange={handleSearchChange}
          />
        </div>
        <ToggleGroup
          type="single"
          value={unreadFilter}
          onValueChange={(val) => val && setUnreadFilter(val)}
          className="justify-start"
        >
          <ToggleGroupItem
            value="all"
            size="sm"
            className="text-xs rounded-full px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            All
          </ToggleGroupItem>
          <ToggleGroupItem
            value="unread"
            size="sm"
            className="text-xs rounded-full px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            Unread
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Loading / reset indicator */}
        {isLoading && filteredLeads.length === 0 && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="space-y-0.5 p-2">
          {filteredLeads.map((lead, index) => (
            <div key={lead._id}>
              <div
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-accent/60 ${
                  selectedLeadId === lead._id ? "bg-accent shadow-sm" : ""
                }`}
                onClick={() => onSelectLead(lead._id)}
              >
                <div className="relative">
                  <Avatar className="h-12 w-12 border border-background shadow-sm">
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {getInitials(lead.name)}
                    </AvatarFallback>
                  </Avatar>
                  {lead.unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full p-0 text-[10px] border-2 border-background shadow-sm">
                      {lead.unreadCount}
                    </Badge>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="font-semibold truncate text-sm">{lead.name}</div>
                    {lead.lastMessageAt > 0 && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2 font-medium">
                        {new Date(lead.lastMessageAt).toLocaleDateString() ===
                        new Date().toLocaleDateString()
                          ? new Date(lead.lastMessageAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : new Date(lead.lastMessageAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    {lead.mobile}
                  </div>
                </div>
              </div>
              {/* Prefetch sentinel at 80% of list */}
              {index === prefetchIndex && <div ref={prefetchRef} />}
            </div>
          ))}

          {filteredLeads.length === 0 && !isLoading && (
            <div className="text-center text-muted-foreground py-8 text-sm">
              No contacts found
            </div>
          )}

          {/* Bottom load-more sentinel */}
          {canLoadMore && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}