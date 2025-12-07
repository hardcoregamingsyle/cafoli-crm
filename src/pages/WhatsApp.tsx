import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Search } from "lucide-react";
import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

export default function WhatsApp() {
  const leads = useQuery(api.leads.getLeads, { filter: "all" }) || [];
  const sendWhatsAppMessage = useAction(api.whatsapp.sendWhatsAppMessage);
  
  const [selectedLeadId, setSelectedLeadId] = useState<Id<"leads"> | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedLead = leads.find(l => l._id === selectedLeadId);
  
  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.mobile.includes(searchQuery)
  );

  const handleSendWhatsApp = async () => {
    if (!selectedLead || !whatsappMessage.trim()) {
      toast.error("Please select a lead and enter a message");
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
      toast.success("WhatsApp message sent successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send WhatsApp message");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AppLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp Messaging</h1>
          <p className="text-muted-foreground">Send WhatsApp messages to your leads.</p>
        </div>

        <div className="flex-1 grid md:grid-cols-2 gap-6 overflow-hidden">
          {/* Lead Selection */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Select Lead
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads by name or mobile..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {filteredLeads.map((lead) => (
                  <div
                    key={lead._id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent/50 ${
                      selectedLeadId === lead._id ? "border-primary bg-accent/50" : ""
                    }`}
                    onClick={() => setSelectedLeadId(lead._id)}
                  >
                    <div className="font-semibold">{lead.name}</div>
                    <div className="text-sm text-muted-foreground">{lead.mobile}</div>
                    <div className="text-xs text-muted-foreground mt-1">{lead.subject}</div>
                  </div>
                ))}
                {filteredLeads.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No leads found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Message Composer */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-green-600" />
                Compose Message
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              {selectedLead ? (
                <>
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <div className="font-semibold mb-1">{selectedLead.name}</div>
                    <div className="text-sm text-muted-foreground">{selectedLead.mobile}</div>
                    {selectedLead.agencyName && (
                      <div className="text-sm text-muted-foreground">{selectedLead.agencyName}</div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col gap-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Type your WhatsApp message here..."
                      value={whatsappMessage}
                      onChange={(e) => setWhatsappMessage(e.target.value)}
                      className="flex-1 min-h-[200px] resize-none"
                    />
                  </div>

                  <Button 
                    onClick={handleSendWhatsApp} 
                    disabled={isSending || !whatsappMessage.trim()}
                    className="w-full"
                    size="lg"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {isSending ? "Sending..." : "Send WhatsApp Message"}
                  </Button>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Select a lead to compose a message</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}