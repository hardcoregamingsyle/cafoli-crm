import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, Plus, Tag as TagIcon, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface TagManagerProps {
  leadId: Id<"leads">;
  selectedTagIds: Id<"tags">[];
  onTagsChange: (newTags: Id<"tags">[]) => void;
}

const PRESET_COLORS = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#eab308", // yellow-500
  "#22c55e", // green-500
  "#06b6d4", // cyan-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#d946ef", // fuchsia-500
  "#f43f5e", // rose-500
  "#64748b", // slate-500
];

import { api } from "@/convex/_generated/api";

export function TagManager({ leadId, selectedTagIds, onTagsChange }: TagManagerProps) {
  const allTags = useQuery(api.tags.getAllTags) || [];
  const createTag = useMutation(api.tags.createTag);
  
  const [open, setOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error("Tag name is required");
      return;
    }

    try {
      const tagId = await createTag({
        name: newTagName.trim(),
        color: newTagColor,
      });
      
      // Automatically select the new tag
      if (selectedTagIds.length < 8) {
        onTagsChange([...selectedTagIds, tagId]);
      } else {
        toast.warning("Tag created but not added (limit 8 tags per lead)");
      }
      
      setIsCreating(false);
      setNewTagName("");
      setNewTagColor(PRESET_COLORS[0]);
      toast.success("Tag created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create tag");
    }
  };

  const toggleTag = (tagId: Id<"tags">) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      if (selectedTagIds.length >= 8) {
        toast.error("Maximum 8 tags allowed per lead");
        return;
      }
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {selectedTagIds.map(tagId => {
        const tag = allTags.find((t: any) => t._id === tagId);
        if (!tag) return null;
        return (
          <div 
            key={tag._id}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
            <button 
              onClick={() => toggleTag(tag._id)}
              className="hover:bg-black/20 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs rounded-full">
            <Plus className="h-3 w-3 mr-1" />
            Add Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[200px]" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." />
            <CommandList>
              <CommandEmpty>
                <div className="p-2 text-center">
                  <p className="text-xs text-muted-foreground mb-2">No tags found.</p>
                  <Button 
                    size="sm" 
                    variant="secondary" 
                    className="w-full h-7 text-xs"
                    onClick={() => setIsCreating(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Create New Tag
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {allTags.map((tag: any) => (
                  <CommandItem
                    key={tag._id}
                    value={tag.name}
                    onSelect={() => toggleTag(tag._id)}
                  >
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1">{tag.name}</span>
                    {selectedTagIds.includes(tag._id) && (
                      <Check className="h-4 w-4 ml-auto" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              {allTags.length > 0 && (
                <div className="p-1 border-t">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full h-7 text-xs justify-start"
                    onClick={() => setIsCreating(true)}
                  >
                    <Plus className="h-3 w-3 mr-2" />
                    Create New Tag
                  </Button>
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tag Name</Label>
              <Input 
                value={newTagName} 
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="e.g. Priority, Follow-up"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      newTagColor === color ? "border-black scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleCreateTag} className="w-full">
              Create Tag
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}