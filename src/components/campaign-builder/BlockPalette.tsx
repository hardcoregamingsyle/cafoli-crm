import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Mail, MessageSquare, GitBranch, Shuffle, Tag, TagIcon, Filter } from "lucide-react";

export interface BlockType {
  type: string;
  label: string;
  icon: any;
  color: string;
}

interface BlockPaletteProps {
  onAddBlock: (type: string) => void;
}

export const blockTypes: BlockType[] = [
  { type: "wait", label: "Wait", icon: Clock, color: "bg-blue-500" },
  { type: "send_email", label: "Send Email", icon: Mail, color: "bg-green-500" },
  { type: "send_whatsapp", label: "Send WhatsApp", icon: MessageSquare, color: "bg-emerald-500" },
  { type: "conditional", label: "Conditional", icon: GitBranch, color: "bg-purple-500" },
  { type: "ab_test", label: "A/B Test", icon: Shuffle, color: "bg-orange-500" },
  { type: "add_tag", label: "Add Tag", icon: Tag, color: "bg-pink-500" },
  { type: "remove_tag", label: "Remove Tag", icon: TagIcon, color: "bg-red-500" },
  { type: "lead_condition", label: "Lead Condition", icon: Filter, color: "bg-indigo-500" },
];

export function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Add Blocks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {blockTypes.map(bt => (
          <Button
            key={bt.type}
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => onAddBlock(bt.type)}
          >
            <bt.icon className="mr-2 h-3.5 w-3.5" />
            {bt.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}