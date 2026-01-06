import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Doc } from "@/convex/_generated/dataModel";
import { MapPin } from "lucide-react";

interface LocationDetailsCardProps {
  lead: Doc<"leads">;
  isEditing: boolean;
  editedLead: Partial<Doc<"leads">>;
  setEditedLead: (lead: Partial<Doc<"leads">>) => void;
}

export function LocationDetailsCard({ lead, isEditing, editedLead, setEditedLead }: LocationDetailsCardProps) {
  return (
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
  );
}
