import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Calendar, Mail, MapPin, MessageSquare, Phone, Save, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface LeadDetailsProps {
  leadId: Id<"leads">;
  onClose: () => void;
}

export default function LeadDetails({ leadId, onClose }: LeadDetailsProps) {
  const { user } = useAuth();
  const lead = useQuery(api.leads.getLead, { id: leadId, userId: user?._id });
  const comments = useQuery(api.leads.getComments, { leadId });
  
  const updateLead = useMutation(api.leads.updateLead);
  const addComment = useMutation(api.leads.addComment);

  const [isEditing, setIsEditing] = useState(false);
  const [editedLead, setEditedLead] = useState<Partial<Doc<"leads">>>({});
  const [newComment, setNewComment] = useState("");

  if (lead === undefined) {
    return <div className="flex-1 flex items-center justify-center">Loading...</div>;
  }

  if (lead === null) {
    return <div className="flex-1 flex items-center justify-center">Lead not found</div>;
  }

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
    <div className="flex-1 flex flex-col overflow-hidden bg-card border rounded-lg shadow-sm">
      <div className="p-6 border-b flex justify-between items-start bg-muted/10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose}>
              <User className="h-4 w-4" />
            </Button>
            <h2 className="text-2xl font-bold">{lead.name}</h2>
            <span className="text-sm text-muted-foreground bg-background border px-2 py-1 rounded">
              {lead.source}
            </span>
            {lead.adminAssignmentRequired && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded border border-purple-200 font-medium">
                Admin Assignment Required
              </span>
            )}
          </div>
          <p className="text-muted-foreground">{lead.subject}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <User className="h-4 w-4" /> Contact Details
            </h3>
            <div className="grid gap-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                {isEditing ? (
                  <Input 
                    value={editedLead.name || ""} 
                    onChange={(e) => setEditedLead({ ...editedLead, name: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1">{lead.name}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Mobile
                </Label>
                {isEditing ? (
                  <Input 
                    value={editedLead.mobile || ""} 
                    onChange={(e) => setEditedLead({ ...editedLead, mobile: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1">{lead.mobile}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                {isEditing ? (
                  <Input 
                    value={editedLead.email || ""} 
                    onChange={(e) => setEditedLead({ ...editedLead, email: e.target.value })}
                    className="mt-1"
                    type="email"
                  />
                ) : (
                  <p className="mt-1">{lead.email || "Not provided"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Agency Name</Label>
                {isEditing ? (
                  <Input 
                    value={editedLead.agencyName || ""} 
                    onChange={(e) => setEditedLead({ ...editedLead, agencyName: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1">{lead.agencyName || "Not provided"}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Location
            </h3>
            <div className="grid gap-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Station</Label>
                {isEditing ? (
                  <Input 
                    value={editedLead.station || ""} 
                    onChange={(e) => setEditedLead({ ...editedLead, station: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1">{lead.station || "Not provided"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">District</Label>
                {isEditing ? (
                  <Input 
                    value={editedLead.district || ""} 
                    onChange={(e) => setEditedLead({ ...editedLead, district: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1">{lead.district || "Not provided"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">State</Label>
                {isEditing ? (
                  <Input 
                    value={editedLead.state || ""} 
                    onChange={(e) => setEditedLead({ ...editedLead, state: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1">{lead.state || "Not provided"}</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Pincode</Label>
                {isEditing ? (
                  <Input 
                    value={editedLead.pincode || ""} 
                    onChange={(e) => setEditedLead({ ...editedLead, pincode: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1">{lead.pincode || "Not provided"}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Follow-up Date
            {lead.assignedTo && <span className="text-xs text-red-500">(Required)</span>}
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
            <div className={`bg-muted/30 p-4 rounded-md text-sm ${
              lead.nextFollowUpDate && lead.nextFollowUpDate < Date.now() 
                ? 'border-2 border-red-500 bg-red-50' 
                : ''
            }`}>
              {formatFollowUpDate(lead.nextFollowUpDate)}
              {lead.nextFollowUpDate && lead.nextFollowUpDate < Date.now() && (
                <span className="ml-2 text-red-600 font-bold">⚠ Overdue</span>
              )}
            </div>
          )}
        </div>

        <div className="mb-8">
          <h3 className="font-semibold mb-2">Message</h3>
          {isEditing ? (
            <Textarea 
              value={editedLead.message || ""} 
              onChange={(e) => setEditedLead({ ...editedLead, message: e.target.value })}
              className="min-h-[100px]"
            />
          ) : (
            <div className="bg-muted/30 p-4 rounded-md text-sm">
              {lead.message || "No message content."}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Activity & Comments
          </h3>
          
          <div className="space-y-4 mb-4">
            {comments?.map((comment) => (
              <div key={comment._id} className="bg-muted/30 p-3 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-sm">{comment.userName}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(comment._creationTime).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{comment.content}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[80px]"
            />
            <Button className="self-end" onClick={handleAddComment}>Post</Button>
          </div>
        </div>
      </div>
    </div>
  );
}