import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users } from "lucide-react";
import { toast } from "sonner";

interface AllocateColdCallerDialogProps {
  availableLeads: number;
  onAllocate: (leadsPerStaff: number) => Promise<void>;
  isAllocating: boolean;
}

export function AllocateColdCallerDialog({
  availableLeads,
  onAllocate,
  isAllocating,
}: AllocateColdCallerDialogProps) {
  const [open, setOpen] = useState(false);
  const [leadsPerStaff, setLeadsPerStaff] = useState<string>("10");

  const handleAllocate = async () => {
    const num = parseInt(leadsPerStaff);
    if (isNaN(num) || num <= 0) {
      toast.error("Please enter a valid number");
      return;
    }

    try {
      await onAllocate(num);
      setOpen(false);
      setLeadsPerStaff("10");
    } catch (error) {
      // Error handled by parent
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="mr-2 h-4 w-4" />
          Assign Cold Caller Leads
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Cold Caller Leads</DialogTitle>
          <DialogDescription>
            Allocate cold caller leads to all staff members. Available leads: <strong>{availableLeads}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="leadsPerStaff" className="text-right">
              Leads per Staff
            </Label>
            <Input
              id="leadsPerStaff"
              type="number"
              min="1"
              value={leadsPerStaff}
              onChange={(e) => setLeadsPerStaff(e.target.value)}
              className="col-span-3"
              placeholder="Enter number of leads"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {availableLeads > 0 ? (
              <p>
                If the requested amount exceeds available leads, they will be distributed equally among staff members.
              </p>
            ) : (
              <p className="text-destructive">
                No unallocated cold caller leads available. Please mark leads as cold caller leads first.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isAllocating}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleAllocate}
            disabled={isAllocating || availableLeads === 0}
          >
            {isAllocating ? "Allocating..." : "Allocate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
