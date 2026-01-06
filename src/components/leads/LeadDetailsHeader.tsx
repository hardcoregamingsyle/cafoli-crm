import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Save, X, ThumbsUp, Trash2, Sparkles } from "lucide-react";
import { TagManager } from "@/components/TagManager";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface LeadDetailsHeaderProps {
  lead: Doc<"leads">;
  isEditing: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveEdits: () => void;
  onStatusChange: (status: string) => void;
  onTypeChange: (type: string) => void;
  onTagsChange: (tags: Id<"tags">[]) => void;
  onDelete: () => void;
  onShowAiDialog: () => void;
}

export function LeadDetailsHeader({
  lead,
  isEditing,
  isAdmin,
  onClose,
  onStartEditing,
  onCancelEditing,
  onSaveEdits,
  onStatusChange,
  onTypeChange,
  onTagsChange,
  onDelete,
  onShowAiDialog,
}: LeadDetailsHeaderProps) {
  return (
    <div className="p-6 border-b flex justify-between items-start bg-muted/10">
      <div className="flex-1 mr-4">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
          <h2 className="text-2xl font-bold truncate">{lead.name}</h2>
          <span className="text-sm text-muted-foreground bg-background border px-2 py-1 rounded whitespace-nowrap">
            {lead.source}
          </span>
          {lead.adminAssignmentRequired && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded border border-purple-200 font-medium whitespace-nowrap">
              Admin Assignment Required
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm mb-3">{lead.subject}</p>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {lead.type === 'Relevant' && (
            <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md flex items-center gap-1 text-sm font-medium border border-emerald-200 w-fit">
              <ThumbsUp className="h-3 w-3" />
              Relevant Lead
            </span>
          )}
          
          <span className={`px-2 py-1 rounded-md text-sm font-medium border ${
            lead.status === 'Hot' ? 'bg-orange-100 text-orange-700 border-orange-200' :
            lead.status === 'Mature' ? 'bg-green-100 text-green-700 border-green-200' :
            lead.status === 'Cold' ? 'bg-blue-100 text-blue-700 border-blue-200' :
            'bg-gray-100 text-gray-700 border-gray-200'
          }`}>
            {lead.status || "Status Not Set"}
          </span>
        </div>

        <TagManager 
          leadId={lead._id} 
          selectedTagIds={lead.tags || []} 
          onTagsChange={onTagsChange} 
        />
      </div>
      <div className="flex gap-2 flex-wrap justify-end">
        {!isEditing && (
          <>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-purple-600 border-purple-200 hover:bg-purple-50"
              onClick={onShowAiDialog}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AI Assist
            </Button>
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the lead
                      and remove their data from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="outline" size="sm" onClick={onStartEditing}>
              <Save className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </>
        )}
        {isEditing && (
          <>
            <Button variant="outline" size="sm" onClick={onCancelEditing}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSaveEdits}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </>
        )}
        <Select value={lead.status || "Cold"} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Cold">Cold</SelectItem>
            <SelectItem value="Hot">Hot</SelectItem>
            <SelectItem value="Mature">Mature</SelectItem>
          </SelectContent>
        </Select>
        <Select value={lead.type || "To be Decided"} onValueChange={onTypeChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="To be Decided">To be Decided</SelectItem>
            <SelectItem value="Relevant">Relevant</SelectItem>
            <SelectItem value="Irrelevant">Irrelevant</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
