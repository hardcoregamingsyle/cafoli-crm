import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ReactNode } from "react";

interface FilterSectionProps {
  title: string;
  hasActiveFilters: boolean;
  onClear: () => void;
  children: ReactNode;
}

export function FilterSection({ title, hasActiveFilters, onClear, children }: FilterSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <Label className="text-base font-semibold">{title}</Label>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-auto p-1 text-xs"
          >
            Clear
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}
