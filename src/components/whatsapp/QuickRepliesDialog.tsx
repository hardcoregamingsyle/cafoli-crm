import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Zap, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

interface QuickRepliesDialogProps {
  onSelectReply: (message: string, quickReplyId: Id<"quickReplies">) => void;
  disabled?: boolean;
}

export function QuickRepliesDialog({ onSelectReply, disabled }: QuickRepliesDialogProps) {
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<Id<"quickReplies"> | null>(null);
  const [newName, setNewName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newCategory, setNewCategory] = useState("General");

  const quickReplies = useQuery(api.quickReplies.listQuickReplies) || [];
  const createQuickReply = useMutation(api.quickReplies.createQuickReply);
  const updateQuickReply = useMutation(api.quickReplies.updateQuickReply);
  const deleteQuickReply = useMutation(api.quickReplies.deleteQuickReply);

  const handleCreate = async () => {
    if (!newName.trim() || !newMessage.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      await createQuickReply({
        name: newName,
        message: newMessage,
        category: newCategory,
      });
      toast.success("Quick reply created");
      setNewName("");
      setNewMessage("");
      setNewCategory("General");
      setIsCreating(false);
    } catch (error) {
      toast.error("Failed to create quick reply");
    }
  };

  const handleUpdate = async (id: Id<"quickReplies">) => {
    if (!newName.trim() || !newMessage.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      await updateQuickReply({
        id,
        name: newName,
        message: newMessage,
        category: newCategory,
      });
      toast.success("Quick reply updated");
      setEditingId(null);
      setNewName("");
      setNewMessage("");
      setNewCategory("General");
    } catch (error) {
      toast.error("Failed to update quick reply");
    }
  };

  const handleDelete = async (id: Id<"quickReplies">) => {
    try {
      await deleteQuickReply({ id });
      toast.success("Quick reply deleted");
    } catch (error) {
      toast.error("Failed to delete quick reply");
    }
  };

  const startEdit = (reply: any) => {
    setEditingId(reply._id);
    setNewName(reply.name);
    setNewMessage(reply.message);
    setNewCategory(reply.category);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewName("");
    setNewMessage("");
    setNewCategory("General");
  };

  const handleSelectReply = (message: string, id: Id<"quickReplies">) => {
    onSelectReply(message, id);
    setOpen(false);
  };

  const categories = Array.from(new Set(quickReplies.map(r => r.category)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-muted-foreground hover:text-foreground"
          title="Quick Replies"
          disabled={disabled}
        >
          <Zap className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Quick Replies</DialogTitle>
          <DialogDescription>
            Pre-defined messages for quick responses during the 24-hour window
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create/Edit Form */}
          {(isCreating || editingId) && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g., Greeting, Follow-up"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  placeholder="e.g., General, Sales"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  placeholder="Type your quick reply message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                {editingId ? (
                  <>
                    <Button size="sm" onClick={() => handleUpdate(editingId)}>
                      <Check className="h-4 w-4 mr-1" />
                      Update
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={handleCreate}>
                      <Check className="h-4 w-4 mr-1" />
                      Create
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsCreating(false)}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Add New Button */}
          {!isCreating && !editingId && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Quick Reply
            </Button>
          )}

          {/* Quick Replies List */}
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {categories.map((category) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">{category}</h4>
                  {quickReplies
                    .filter((r) => r.category === category)
                    .map((reply) => (
                      <div
                        key={reply._id}
                        className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 cursor-pointer" onClick={() => handleSelectReply(reply.message, reply._id)}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{reply.name}</span>
                              <Badge variant="secondary" className="text-xs">
                                Used {reply.usageCount}x
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {reply.message}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(reply)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(reply._id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ))}
              {quickReplies.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No quick replies yet</p>
                  <p className="text-sm">Create your first quick reply to get started</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
