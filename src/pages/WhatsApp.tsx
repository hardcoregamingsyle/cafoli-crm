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
      <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[350px] flex-shrink-0 border-r flex flex-col bg-muted/10">
          {/* Sidebar Header */}
          <div className="h-16 border-b flex items-center justify-between px-4 bg-background">
            <h1 className="text-xl font-semibold">Messages</h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setShowCreateGroupDialog(true)} title="Create Group">
                <Users className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setShowBulkDialog(true)} title="Bulk Send">
                <Send className="h-4 w-4" />
              </Button>
              {user?.role === ROLES.ADMIN && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleUpdateInterface} 
                  disabled={isUpdating} 
                  title="Sync Interface"
                >
                  <Settings className={`h-4 w-4 ${isUpdating ? "animate-spin" : ""}`} />
                </Button>
              )}
            </div>
          </div>

          {/* Tabs for Chats / Groups */}
          <Tabs defaultValue="chats" className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2 bg-background border-b">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="chats">Chats</TabsTrigger>
                <TabsTrigger value="groups">Groups</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="chats" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col">
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
            </TabsContent>
            
            <TabsContent value="groups" className="flex-1 min-h-0 m-0 data-[state=active]:flex flex-col">
              <GroupsList />
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 min-w-0 bg-background flex flex-col">
          {selectedLeadId && selectedLead ? (
            <ChatWindow 
              selectedLeadId={selectedLeadId} 
              selectedLead={selectedLead} 
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-muted/5">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <MessageSquare className="h-10 w-10 text-primary/40" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">WhatsApp Messages</h2>
              <p className="text-muted-foreground max-w-md text-center">
                Select a contact from the sidebar to start messaging. You can send text, media, and use AI to generate replies.
              </p>
            </div>
          )}
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