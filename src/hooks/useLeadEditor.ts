import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";

interface UseLeadEditorProps {
  lead: Doc<"leads">;
  user: Doc<"users"> | null | undefined;
}

export function useLeadEditor({ lead, user }: UseLeadEditorProps) {
  const updateLead = useMutation(api.leads.updateLead);
  const addComment = useMutation(api.leads.addComment);

  const [isEditing, setIsEditing] = useState(false);
  const [editedLead, setEditedLead] = useState<Partial<Doc<"leads">>>({});
  const [newComment, setNewComment] = useState("");

  const handleStatusChange = async (status: string) => {
    if (!user) return;
    await updateLead({ id: lead._id, patch: { status }, userId: user._id });
    toast.success("Status updated");
  };

  const handleTypeChange = async (type: string) => {
    if (!user) return;
    await updateLead({ id: lead._id, patch: { type }, userId: user._id });
    toast.success("Type updated");
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user) return;
    await addComment({ leadId: lead._id, content: newComment, userId: user._id });
    setNewComment("");
    toast.success("Comment added");
  };

  const handleTagsChange = async (newTags: Id<"tags">[]) => {
    if (!user) return;
    await updateLead({ id: lead._id, patch: { tags: newTags }, userId: user._id });
    toast.success("Tags updated");
  };

  const startEditing = () => {
    setEditedLead({
      name: lead.name,
      subject: lead.subject,
      mobile: lead.mobile,
      altMobile: lead.altMobile,
      email: lead.email,
      altEmail: lead.altEmail,
      agencyName: lead.agencyName,
      pincode: lead.pincode,
      state: lead.state,
      district: lead.district,
      station: lead.station,
      message: lead.message,
      nextFollowUpDate: lead.nextFollowUpDate,
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedLead({});
  };

  const saveEdits = async () => {
    if (!user) return;

    // Validate follow-up date if lead is assigned
    if (lead.assignedTo && editedLead.nextFollowUpDate) {
      const followUpDate = editedLead.nextFollowUpDate;
      const now = Date.now();
      const maxFutureDate = now + (31 * 24 * 60 * 60 * 1000); // 31 days from now

      if (followUpDate <= now) {
        toast.error("Follow-up date must be in the future");
        return;
      }

      if (followUpDate > maxFutureDate) {
        toast.error("Follow-up date cannot be more than 31 days in the future");
        return;
      }
    }

    // Require follow-up date for assigned leads
    if (lead.assignedTo && !editedLead.nextFollowUpDate) {
      toast.error("Follow-up date is required for assigned leads");
      return;
    }

    try {
      await updateLead({ 
        id: lead._id, 
        patch: {
          name: editedLead.name,
          mobile: editedLead.mobile,
          email: editedLead.email,
          agencyName: editedLead.agencyName,
          pincode: editedLead.pincode,
          state: editedLead.state,
          district: editedLead.district,
          station: editedLead.station,
          message: editedLead.message,
          nextFollowUpDate: editedLead.nextFollowUpDate,
        },
        userId: user._id,
      });
      setIsEditing(false);
      setEditedLead({});
      toast.success("Lead updated successfully");
    } catch (error) {
      toast.error("Failed to update lead");
    }
  };

  return {
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
  };
}
