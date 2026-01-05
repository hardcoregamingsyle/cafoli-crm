import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, MessageSquare, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export function ContactRequestPopup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);

  const pendingRequests = useQuery(
    api.contactRequests.getPendingContactRequests,
    user ? { userId: user._id } : "skip"
  );

  const acknowledgeRequest = useMutation(api.contactRequests.acknowledgeContactRequest);

  // Debug logging
  useEffect(() => {
    if (pendingRequests) {
      console.log("ContactRequestPopup - Pending requests:", pendingRequests.length);
      if (pendingRequests.length > 0) {
        console.log("ContactRequestPopup - First request:", pendingRequests[0]);
      }
    }
  }, [pendingRequests]);

  const currentRequest = pendingRequests?.[0];

  const handleGoToWhatsApp = async () => {
    if (!currentRequest) return;

    setIsNavigating(true);
    try {
      await acknowledgeRequest({ requestId: currentRequest._id });
      navigate(`/whatsapp?leadId=${currentRequest.leadId}`);
      toast.success("Navigating to WhatsApp chat");
    } catch (error) {
      console.error("Failed to acknowledge request:", error);
      toast.error("Failed to acknowledge request");
      setIsNavigating(false);
    }
  };

  // Don't render if no requests or no lead data
  if (!currentRequest || !currentRequest.lead) {
    console.log("ContactRequestPopup - Not rendering:", { 
      hasRequest: !!currentRequest, 
      hasLead: !!currentRequest?.lead 
    });
    return null;
  }

  console.log("ContactRequestPopup - Rendering popup for lead:", currentRequest.lead.name);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 mb-2">
            <AlertCircle className="h-5 w-5" />
            <DialogTitle className="text-lg">Urgent: Customer Contact Request</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            A customer is requesting to speak with you. Please attend to this immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {getInitials(currentRequest.lead.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="font-semibold text-base">{currentRequest.lead.name}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {currentRequest.lead.mobile}
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">Customer Message:</p>
                <p className="text-sm text-blue-800">{currentRequest.customerMessage}</p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> An automated message has been sent to the customer informing
              them that you will contact them shortly.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleGoToWhatsApp}
            disabled={isNavigating}
            size="lg"
            className="w-full"
          >
            {isNavigating ? "Opening WhatsApp..." : "Go to WhatsApp Chat"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            You must attend to this request to continue
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}