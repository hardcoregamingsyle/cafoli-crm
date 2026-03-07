import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Users, Calendar, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const api = getConvexApi() as any;

export function GroupsList() {
  const groups = useQuery(api.whatsappGroupsQueries.getAllGroups) || [];

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied!");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "created":
        return "bg-green-500";
      case "pending":
        return "bg-yellow-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-transparent">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-0.5 p-2">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No groups created yet</p>
            </div>
          ) : (
            groups.map((group: any) => (
              <div
                key={group._id}
                className="flex items-center gap-3 p-3 rounded-xl transition-all duration-200 hover:bg-accent/60 group"
              >
                <Avatar className="h-12 w-12 border border-background shadow-sm">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="font-semibold truncate text-sm">{group.name}</div>
                    <Badge className={`h-4 text-[9px] px-1.5 ${getStatusColor(group.status)}`}>
                      {group.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {group.participantPhoneNumbers.length}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(group._creationTime).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {group.inviteLink && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleCopyLink(group.inviteLink)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Invite Link
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
