import { Doc } from "@/convex/_generated/dataModel";
import { ContactDetailsCard } from "./ContactDetailsCard";
import { LocationDetailsCard } from "./LocationDetailsCard";

interface LeadInfoProps {
  lead: Doc<"leads">;
  isEditing: boolean;
  editedLead: Partial<Doc<"leads">>;
  setEditedLead: (lead: Partial<Doc<"leads">>) => void;
}

export function LeadInfo({ lead, isEditing, editedLead, setEditedLead }: LeadInfoProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6 mb-8">
      <ContactDetailsCard 
        lead={lead} 
        isEditing={isEditing} 
        editedLead={editedLead} 
        setEditedLead={setEditedLead} 
      />
      <LocationDetailsCard 
        lead={lead} 
        isEditing={isEditing} 
        editedLead={editedLead} 
        setEditedLead={setEditedLead} 
      />
    </div>
  );
}