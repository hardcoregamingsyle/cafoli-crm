import AppLayout from "@/components/AppLayout";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";
import { ContactList } from "@/components/whatsapp/ContactList";
import { Button } from "@/components/ui/button";
import { getConvexApi } from "@/lib/convex-api";
import { CreateGroupDialog } from "@/components/whatsapp/CreateGroupDialog";
import { GroupsList } from "@/components/whatsapp/GroupsList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { ROLES } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useAction } from "convex/react";
import { MessageSquare, Settings, Send } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { LeadSelector } from "@/components/LeadSelector";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const api = getConvexApi() as any;

export default function WhatsApp() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");

  // Determine filter based on user role
  const filter = user?.role === ROLES.ADMIN ? "all" : "mine";

  // Use standard query instead of paginated query to avoid loading issues
  const leadsResult = useQuery(
    api.whatsappQueries.getLeadsWithChatStatus,
    { filter, userId: user?._id, searchQuery: searchQuery || undefined }
  );

  const leads = leadsResult || [];
  const canLoadMore = false;
  const isLoading = leadsResult === undefined;

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
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);

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
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
        <div className="flex-shrink-0 p-4 border-b flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowCreateGroupDialog(true)}
            >
              <Users className="mr-2 h-4 w-4" />
              Create Group
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowBulkDialog(true)}
            >
              <Send className="mr-2 h-4 w-4" />
              Bulk Send
            </Button>
            {user?.role === ROLES.ADMIN && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleUpdateInterface}
                disabled={isUpdating}
              >
                <Settings className="mr-2 h-4 w-4" />
                {isUpdating ? "Syncing..." : "Sync Interface"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <Tabs defaultValue="chats" className="h-full flex flex-col">
            <div className="px-4 pt-2 border-b bg-card">
              <TabsList className="mb-2">
                <TabsTrigger value="chats">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chats
                </TabsTrigger>
                <TabsTrigger value="groups">
                  <Users className="h-4 w-4 mr-2" />
                  Groups
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="chats" className="flex-1 min-h-0 overflow-hidden m-0 border-none data-[state=active]:flex">
              <div className="flex w-full h-full">
                {/* Contacts List */}
                <div className="w-[350px] border-r flex-shrink-0 bg-background">
                  <ContactList
                    leads={leads}
                    selectedLeadId={selectedLeadId}
                    onSelectLead={setSelectedLeadId}
                    onLoadMore={() => {}}
                    canLoadMore={canLoadMore}
                    isLoading={isLoading}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                  />
                </div>

                {/* Chat Area */}
                <div className="flex-1 min-w-0 bg-background">
                  {selectedLeadId && selectedLead ? (
                    <ChatWindow 
                      selectedLeadId={selectedLeadId} 
                      selectedLead={selectedLead} 
                    />
                  ) : (
                    <div className="flex flex-col h-full items-center justify-center bg-muted/10">
                      <div className="text-center">
                        <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
                        <p className="text-lg font-medium mb-1">Select a contact</p>
                        <p className="text-sm text-muted-foreground">Choose a contact to start messaging</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="groups" className="flex-1 overflow-auto p-4 m-0">
              <GroupsList />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Create Group Dialog */}
      <CreateGroupDialog 
        open={showCreateGroupDialog}
        onOpenChange={setShowCreateGroupDialog}
      />

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