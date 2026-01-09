import AppLayout from "@/components/AppLayout";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";
import { ContactList } from "@/components/whatsapp/ContactList";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getConvexApi } from "@/lib/convex-api";

const api = getConvexApi() as any;
import { Id } from "@/convex/_generated/dataModel";
import { ROLES } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";
import { usePaginatedQuery, useAction } from "convex/react";
import { MessageSquare, Settings, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { LeadSelector } from "@/components/LeadSelector";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function WhatsApp() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  // Determine filter based on user role
  const filter = user?.role === ROLES.ADMIN ? "all" : "mine";

  // Use paginated query for leads (20 items per page)
  const { results: leadsResult, status, loadMore } = usePaginatedQuery(
    api.whatsappQueries.getLeadsWithChatStatus,
    { filter, userId: user?._id },
    { initialNumItems: 20 }
  );

  const leads = (leadsResult as any)?.page || [];
  const canLoadMore = status === "CanLoadMore";
  const isLoading = status === "LoadingFirstPage";

  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | null>(null);
  const selectedLead = leads.find((l: any) => l._id === selectedLeadId);

  // Handle leadId from URL params (for intervention navigation)
  useEffect(() => {
    const leadIdParam = searchParams.get("leadId");
    if (leadIdParam && leads.length > 0) {
      const lead = leads.find((l: any) => l._id === leadIdParam);
      if (lead) {
        setSelectedLeadId(leadIdParam as Id<"leads">);
      }
    }
  }, [searchParams, leads]);

  const updateInterface = useAction(api.whatsapp.config.updateInterface);
  const sendBulkMessages = useAction(api.whatsappBulk.sendBulkWhatsAppMessages);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Bulk send state
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [isSendingBulk, setIsSendingBulk] = useState(false);

  const handleUpdateInterface = async () => {
    setIsUpdating(true);
    try {
      const result = await updateInterface();
      if (result.errors.length > 0) {
        console.error(result.errors);
        toast.error("Some updates failed. Check console.");
      } else {
        toast.success("WhatsApp interface updated successfully");
      }
    } catch (error) {
      toast.error("Failed to update interface");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBulkSend = async () => {
    if (!bulkMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }
    
    if (selectedLeadIds.length === 0) {
      toast.error("Please select at least one lead");
      return;
    }

    setIsSendingBulk(true);
    try {
      const result = await sendBulkMessages({
        leadIds: selectedLeadIds as Id<"leads">[],
        message: bulkMessage,
      });
      
      toast.success(`Sent ${result.sent} messages successfully. ${result.failed} failed.`);
      
      if (result.errors.length > 0) {
        console.error("Bulk send errors:", result.errors);
      }
      
      // Reset state
      setShowBulkDialog(false);
      setBulkMessage("");
      setSelectedLeadIds([]);
    } catch (error) {
      toast.error("Failed to send bulk messages");
      console.error(error);
    } finally {
      setIsSendingBulk(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex-shrink-0 p-6 pb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">WhatsApp Messaging</h1>
            <p className="text-muted-foreground">
              {user?.role === ROLES.ADMIN 
                ? "Send WhatsApp messages to all leads." 
                : "Send WhatsApp messages to your assigned leads."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="default" 
              onClick={() => setShowBulkDialog(true)}
            >
              <Send className="mr-2 h-4 w-4" />
              Bulk Send
            </Button>
            {user?.role === ROLES.ADMIN && (
              <Button 
                variant="outline" 
                onClick={handleUpdateInterface}
                disabled={isUpdating}
              >
                <Settings className="mr-2 h-4 w-4" />
                {isUpdating ? "Syncing..." : "Sync Interface"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 grid md:grid-cols-[350px_1fr] gap-4 px-6 pb-6 min-h-0 overflow-hidden">
          {/* Contacts List */}
          <ContactList
            leads={leads}
            selectedLeadId={selectedLeadId}
            onSelectLead={setSelectedLeadId}
            onLoadMore={() => loadMore(20)}
            canLoadMore={canLoadMore}
            isLoading={isLoading}
          />

          {/* Chat Area */}
          {selectedLeadId && selectedLead ? (
            <ChatWindow 
              selectedLeadId={selectedLeadId} 
              selectedLead={selectedLead} 
            />
          ) : (
            <Card className="flex flex-col h-full overflow-hidden items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-20 w-20 mx-auto mb-4 text-muted-foreground/20" />
                <p className="text-lg font-semibold mb-2">Select a contact</p>
                <p className="text-muted-foreground">Choose a contact to start messaging</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Bulk Send Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Send Bulk WhatsApp Messages</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Message</label>
              <Textarea
                placeholder="Enter your message..."
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium">Select Recipients</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedLeadIds([])}
                  disabled={selectedLeadIds.length === 0}
                >
                  Clear Selection
                </Button>
              </div>
              <LeadSelector
                isOpen={true}
                onClose={() => {}}
                leads={leads}
                selectedLeadIds={selectedLeadIds}
                onSelectionChange={setSelectedLeadIds}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBulkSend}
              disabled={isSendingBulk || selectedLeadIds.length === 0 || !bulkMessage.trim()}
            >
              {isSendingBulk ? "Sending..." : `Send to ${selectedLeadIds.length} lead(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}