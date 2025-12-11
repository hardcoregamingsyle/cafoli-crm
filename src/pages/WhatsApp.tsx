import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Search, Phone, Video, MoreVertical } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@/convex/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function WhatsApp() {
  const { user } = useAuth();
  
  // Determine filter based on user role
  const filter = user?.role === ROLES.ADMIN ? "all" : "mine";
  const leads = useQuery(api.leads.getLeads, { filter, userId: user?._id }) || [];
  
  const sendWhatsAppMessage = useAction(api.whatsapp.sendWhatsAppMessage);
  
  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedLead = leads.find(l => l._id === selectedLeadId);
  const messages = useQuery(
    api.whatsappQueries.getChatMessages,
    selectedLeadId ? { leadId: selectedLeadId } : "skip"
  ) || [];
  
  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.mobile.includes(searchQuery)
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendWhatsApp = async () => {
    if (!selectedLead || !whatsappMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }
    
    setIsSending(true);
    try {
      await sendWhatsAppMessage({
        phoneNumber: selectedLead.mobile,
        message: whatsappMessage,
        leadId: selectedLead._id,
      });
      setWhatsappMessage("");
      toast.success("Message sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendWhatsApp();
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: true 
    });
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="mb-4">
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp Messaging</h1>
          <p className="text-muted-foreground">
            {user?.role === ROLES.ADMIN 
              ? "Send WhatsApp messages to all leads." 
              : "Send WhatsApp messages to your assigned leads."}
          </p>
        </div>

        <div className="flex-1 grid md:grid-cols-[350px_1fr] gap-4 overflow-hidden">
          {/* Contacts List */}
          <Card className="flex flex-col border-r">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="space-y-1 px-2 pb-2">
                {filteredLeads.map((lead) => (
                  <div
                    key={lead._id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-accent/50 ${
                      selectedLeadId === lead._id ? "bg-accent" : ""
                    }`}
                    onClick={() => setSelectedLeadId(lead._id)}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(lead.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{lead.name}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {lead.mobile}
                      </div>
                    </div>
                  </div>
                ))}
                {filteredLeads.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No contacts found
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>

          {/* Chat Area */}
          <Card className="flex flex-col">
            {selectedLead ? (
              <>
                {/* Chat Header */}
                <CardHeader className="border-b py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(selectedLead.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold">{selectedLead.name}</div>
                        <div className="text-xs text-muted-foreground">{selectedLead.mobile}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <Video className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {/* Messages Area */}
                <ScrollArea className="flex-1 p-4 bg-[#efeae2] relative overflow-hidden">
                  {/* WhatsApp background pattern */}
                  <div 
                    className="absolute inset-0 opacity-[0.06]" 
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                      backgroundSize: '60px 60px'
                    }}
                  />
                  <div className="space-y-4 relative z-10">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center py-12">
                        <MessageSquare className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">No messages yet</p>
                        <p className="text-sm text-muted-foreground">Send a message to start the conversation</p>
                      </div>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message._id}
                          className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
                              message.direction === "outbound"
                                ? "bg-[#d9fdd3]"
                                : "bg-white"
                            }`}
                          >
                            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{message.content}</p>
                            <div className="text-[11px] mt-1 text-gray-500 text-right">
                              {formatTime(message._creationTime)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <div className="border-t p-4">
                  <div className="flex items-end gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={whatsappMessage}
                      onChange={(e) => setWhatsappMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="flex-1"
                      disabled={isSending}
                    />
                    <Button 
                      onClick={handleSendWhatsApp} 
                      disabled={isSending || !whatsappMessage.trim()}
                      size="icon"
                      className="h-10 w-10"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-20 w-20 mx-auto mb-4 text-muted-foreground/20" />
                  <p className="text-lg font-semibold mb-2">Select a contact</p>
                  <p className="text-muted-foreground">Choose a contact to start messaging</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}