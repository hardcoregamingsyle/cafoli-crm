import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Doc } from "@/convex/_generated/dataModel";
import { Mail, MapPin, Phone, User } from "lucide-react";

interface LeadInfoProps {
  lead: Doc<"leads">;
  isEditing: boolean;
  editedLead: Partial<Doc<"leads">>;
  setEditedLead: (lead: Partial<Doc<"leads">>) => void;
}

export function LeadInfo({ lead, isEditing, editedLead, setEditedLead }: LeadInfoProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6 mb-8">
      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-primary">
          <User className="h-4 w-4" /> Contact Details
        </h3>
        <div className="grid gap-4 text-sm bg-muted/20 p-4 rounded-lg border">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            {isEditing ? (
              <Input 
                value={editedLead.name || ""} 
                onChange={(e) => setEditedLead({ ...editedLead, name: e.target.value })}
                className="mt-1"
              />
            ) : (
              <p className="mt-1 font-medium">{lead.name}</p>
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
              <p className="mt-1 font-mono">{lead.mobile}</p>
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
              <p className="mt-1">{lead.email || <span className="text-muted-foreground italic">Not provided</span>}</p>
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
              <p className="mt-1">{lead.agencyName || <span className="text-muted-foreground italic">Not provided</span>}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-primary">
          <MapPin className="h-4 w-4" /> Location
        </h3>
        <div className="grid gap-4 text-sm bg-muted/20 p-4 rounded-lg border">
          <div>
            <Label className="text-xs text-muted-foreground">Station</Label>
            {isEditing ? (
              <Input 
                value={editedLead.station || ""} 
                onChange={(e) => setEditedLead({ ...editedLead, station: e.target.value })}
                className="mt-1"
              />
            ) : (
              <p className="mt-1">{lead.station || <span className="text-muted-foreground italic">Not provided</span>}</p>
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
              <p className="mt-1">{lead.district || <span className="text-muted-foreground italic">Not provided</span>}</p>
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
              <p className="mt-1">{lead.state || <span className="text-muted-foreground italic">Not provided</span>}</p>
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
              <p className="mt-1">{lead.pincode || <span className="text-muted-foreground italic">Not provided</span>}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
