import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useAction } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";
import { useAuth } from "@/hooks/use-auth";

const api = getConvexApi() as any;

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateGroupDialog({ open, onOpenChange }: CreateGroupDialogProps) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [participants, setParticipants] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const createGroup = useAction(api.whatsappGroups.createGroup);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    if (!user?._id) {
      toast.error("User not authenticated");
      return;
    }

    const phoneNumbers = participants
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    setIsCreating(true);
    try {
      const result = await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        participantPhoneNumbers: phoneNumbers,
        userId: user._id,
      });

      if (result.success) {
        toast.success("Group created successfully!");
        setInviteLink(result.inviteLink || "");
      } else {
        toast.error(result.error || "Failed to create group");
      }
    } catch (error) {
      toast.error("Failed to create group");
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("Invite link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setParticipants("");
    setInviteLink("");
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create WhatsApp Group</DialogTitle>
        </DialogHeader>

        {!inviteLink ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="group-name">Group Name *</Label>
              <Input
                id="group-name"
                placeholder="Enter group name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isCreating}
              />
            </div>

            <div>
              <Label htmlFor="group-description">Description (Optional)</Label>
              <Textarea
                id="group-description"
                placeholder="Enter group description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={isCreating}
              />
            </div>

            <div>
              <Label htmlFor="participants">Participant Phone Numbers (Optional)</Label>
              <Textarea
                id="participants"
                placeholder="Enter phone numbers (one per line)&#10;+1234567890&#10;+0987654321"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                rows={5}
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter one phone number per line with country code
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">
                Group created successfully!
              </p>
              <p className="text-xs text-green-700 dark:text-green-300">
                Share the invite link below with participants
              </p>
            </div>

            <div>
              <Label>Invite Link</Label>
              <div className="flex gap-2 mt-1">
                <Input value={inviteLink} readOnly className="flex-1" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!inviteLink ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isCreating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Group"}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
