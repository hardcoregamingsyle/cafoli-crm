import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Users, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">WhatsApp Groups</h2>
        <Badge variant="outline">{groups.length} Total</Badge>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-16 w-16 text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground">No groups created yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group: any) => (
            <Card key={group._id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{group.name}</CardTitle>
                  <Badge className={getStatusColor(group.status)}>
                    {group.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {group.description}
                  </p>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>{group.participantPhoneNumbers.length} participants</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {new Date(group._creationTime).toLocaleDateString()}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground">
                  Created by: {group.creatorName}
                </div>

                {group.inviteLink && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleCopyLink(group.inviteLink)}
                  >
                    <Copy className="h-3 w-3 mr-2" />
                    Copy Invite Link
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
