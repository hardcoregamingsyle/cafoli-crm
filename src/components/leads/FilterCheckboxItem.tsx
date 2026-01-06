import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface FilterCheckboxItemProps {
  id: string;
  checked: boolean;
  onCheckedChange: () => void;
  label: React.ReactNode;
}

export function FilterCheckboxItem({ id, checked, onCheckedChange, label }: FilterCheckboxItemProps) {
  return (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <Label
        htmlFor={id}
        className="text-sm font-normal cursor-pointer flex-1"
      >
        {label}
      </Label>
    </div>
  );
}
