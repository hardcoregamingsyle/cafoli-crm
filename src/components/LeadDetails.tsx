import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Calendar, Save, User, X, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { TagManager } from "@/components/TagManager";
import { LeadInfo } from "@/components/leads/LeadInfo";
import { LeadActivity } from "@/components/leads/LeadActivity";
import { useLeadEditor } from "@/hooks/useLeadEditor";
import { api } from "@/convex/_generated/api";

interface LeadDetailsProps {
  leadId: Id<"leads">;
  onClose: () => void;
}

export default function LeadDetails({ leadId, onClose }: LeadDetailsProps) {
  const { user } = useAuth();
  
  const lead = useQuery(api.leadQueries.getLead, { id: leadId, userId: user?._id });
  const comments = useQuery(api.leadQueries.getComments, { leadId });
  
  const {
    isEditing,
    editedLead,
    setEditedLead,
    newComment,
    setNewComment,
    handleStatusChange,
    handleTypeChange,
    handleAddComment,
    handleTagsChange,
    startEditing,
    cancelEditing,
    saveEdits,
  } = useLeadEditor({ lead: lead!, user });

  if (lead === undefined) {
    return <div className="flex-1 flex items-center justify-center h-full">Loading...</div>;
  }

  if (lead === null) {
    return <div className="flex-1 flex items-center justify-center h-full">Lead not found</div>;
  }

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    return now.toISOString().slice(0, 16);
  };

  const getMaxDateTime = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 31);
    return maxDate.toISOString().slice(0, 16);
  };

  const formatFollowUpDate = (timestamp?: number) => {
    if (!timestamp) return "Not set";
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-card border rounded-lg shadow-sm h-full">
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
            onTagsChange={handleTagsChange} 
          />
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Save className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          {isEditing && (
            <>
              <Button variant="outline" size="sm" onClick={cancelEditing}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdits}>
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
            </>
          )}
          <Select value={lead.status || "Cold"} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cold">Cold</SelectItem>
              <SelectItem value="Hot">Hot</SelectItem>
              <SelectItem value="Mature">Mature</SelectItem>
            </SelectContent>
          </Select>
          <Select value={lead.type || "To be Decided"} onValueChange={handleTypeChange}>
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

      <div className="flex-1 overflow-y-auto p-6">
        <LeadInfo 
          lead={lead} 
          isEditing={isEditing} 
          editedLead={editedLead} 
          setEditedLead={setEditedLead} 
        />

        <div className="mb-8">
          <h3 className="font-semibold mb-2 flex items-center gap-2 text-primary">
            <Calendar className="h-4 w-4" /> Follow-up Date
            {lead.assignedTo && <span className="text-xs text-red-500 font-normal">(Required)</span>}
          </h3>
          {isEditing ? (
            <div className="space-y-2">
              <Input 
                type="datetime-local"
                value={editedLead.nextFollowUpDate ? new Date(editedLead.nextFollowUpDate).toISOString().slice(0, 16) : ""}
                onChange={(e) => setEditedLead({ ...editedLead, nextFollowUpDate: new Date(e.target.value).getTime() })}
                min={getMinDateTime()}
                max={getMaxDateTime()}
                className="max-w-md"
              />
              <p className="text-xs text-muted-foreground">
                Must be between now and 31 days in the future
              </p>
            </div>
          ) : (
            <div className={`bg-muted/30 p-4 rounded-md text-sm border ${
              lead.nextFollowUpDate && lead.nextFollowUpDate < Date.now() 
                ? 'border-red-500 bg-red-50' 
                : 'border-border'
            }`}>
              {formatFollowUpDate(lead.nextFollowUpDate)}
              {lead.nextFollowUpDate && lead.nextFollowUpDate < Date.now() && (
                <span className="ml-2 text-red-600 font-bold">⚠ Overdue</span>
              )}
            </div>
          )}
        </div>

        <div className="mb-8">
          <h3 className="font-semibold mb-2 text-primary">Message</h3>
          {isEditing ? (
            <Textarea 
              value={editedLead.message || ""} 
              onChange={(e) => setEditedLead({ ...editedLead, message: e.target.value })}
              className="min-h-[100px]"
            />
          ) : (
            <div className="bg-muted/30 p-4 rounded-md text-sm border border-border">
              {lead.message || <span className="text-muted-foreground italic">No message content.</span>}
            </div>
          )}
        </div>

        <LeadActivity 
          comments={comments || []} 
          newComment={newComment} 
          setNewComment={setNewComment} 
          onAddComment={handleAddComment} 
        />
      </div>
    </div>
  );
}