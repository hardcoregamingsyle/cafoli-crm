import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { FormEvent } from "react";
import { toast } from "sonner";

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: Id<"users">;
}

export function CreateLeadDialog({ open, onOpenChange, userId }: CreateLeadDialogProps) {
  const createLead = useMutation(api.leads.standard.createLead);

  const handleCreateLead = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userId) return;
    const formData = new FormData(e.currentTarget);
    try {
      await createLead({
        name: formData.get("name") as string,
        subject: formData.get("subject") as string,
        source: "Manual",
        mobile: formData.get("mobile") as string,
        email: formData.get("email") as string || undefined,
        agencyName: formData.get("agencyName") as string || undefined,
        message: formData.get("message") as string || undefined,
        userId: userId,
      });
      onOpenChange(false);
      toast.success("Lead created successfully");
    } catch (error) {
      toast.error("Failed to create lead");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateLead} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input name="name" required placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject</label>
              <Input name="subject" required placeholder="Inquiry about..." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Mobile</label>
              <Input name="mobile" required placeholder="+1234567890" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input name="email" type="email" placeholder="john@example.com" />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Agency Name</label>
              <Input name="agencyName" placeholder="Company Ltd." />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea name="message" placeholder="Initial message..." />
            </div>
          </div>
          <Button type="submit" className="w-full">Create Lead</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}