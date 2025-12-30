import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CampaignSettingsProps {
  name: string;
  description: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
}

export function CampaignSettings({
  name,
  description,
  onNameChange,
  onDescriptionChange,
}: CampaignSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Campaign Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input 
            value={name} 
            onChange={(e) => onNameChange(e.target.value)} 
            placeholder="My Campaign" 
          />
        </div>
        <div>
          <Label>Description</Label>
          <Input 
            value={description} 
            onChange={(e) => onDescriptionChange(e.target.value)} 
            placeholder="Optional" 
          />
        </div>
      </CardContent>
    </Card>
  );
}
