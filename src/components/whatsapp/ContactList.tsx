import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Id } from "@/convex/_generated/dataModel";
import { Search, Loader2 } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

interface ContactListProps {
  leads: any[];
  selectedLeadId: Id<"leads"> | null;
  onSelectLead: (id: Id<"leads">) => void;
  onLoadMore: () => void;
  canLoadMore: boolean;
  isLoading: boolean;
}

export function ContactList({
  leads,
  selectedLeadId,
  onSelectLead,
  onLoadMore,
  canLoadMore,
  isLoading,
}: ContactListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadFilter, setUnreadFilter] = useState<string>("all");
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.mobile.includes(searchQuery);
    
    if (unreadFilter === "unread") {
      return matchesSearch && (lead.unreadCount > 0);
    }
    return matchesSearch;
  });

  // Intersection Observer for infinity scrolling
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && canLoadMore && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.5 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [canLoadMore, isLoading, onLoadMore]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card className="flex flex-col border-r h-full overflow-hidden">
      <CardHeader className="pb-3 flex-shrink-0 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <ToggleGroup type="single" value={unreadFilter} onValueChange={(val) => val && setUnreadFilter(val)} className="justify-start">
          <ToggleGroupItem value="all" size="sm" className="text-xs">All</ToggleGroupItem>
          <ToggleGroupItem value="unread" size="sm" className="text-xs">Unread</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-1 px-2 pb-2">
          {filteredLeads.map((lead) => (
            <div
              key={lead._id}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-accent/50 ${
                selectedLeadId === lead._id ? "bg-accent" : ""
              }`}
              onClick={() => onSelectLead(lead._id)}
            >
              <div className="relative">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(lead.name)}
                  </AvatarFallback>
                </Avatar>
                {lead.unreadCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full p-0 text-[10px] border-2 border-background">
                    {lead.unreadCount}
                  </Badge>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <div className="font-semibold truncate">{lead.name}</div>
                  {lead.lastMessageAt > 0 && (
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                      {new Date(lead.lastMessageAt).toLocaleDateString() === new Date().toLocaleDateString()
                        ? new Date(lead.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : new Date(lead.lastMessageAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground truncate">
                  {lead.mobile}
                </div>
              </div>
            </div>
          ))}
          {filteredLeads.length === 0 && !isLoading && (
            <div className="text-center text-muted-foreground py-8">
              No contacts found
            </div>
          )}
          {/* Load more trigger */}
          {canLoadMore && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {isLoading && filteredLeads.length === 0 && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
