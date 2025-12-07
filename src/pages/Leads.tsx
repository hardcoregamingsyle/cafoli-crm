import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
// import { format } from "date-fns";
import { CalendarIcon, MessageSquare, Phone, Mail, MapPin, User, Search, Plus } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function Leads() {
  const location = useLocation();
  const path = location.pathname;
  
  // Determine filter based on path
  const filter = path === "/my_leads" ? "mine" : path === "/all_leads" ? "all" : "unassigned";
  const title = path === "/my_leads" ? "My Leads" : path === "/all_leads" ? "All Leads" : "Unassigned Leads";

  const leads = useQuery(api.leads.getLeads, { filter }) || [];
  const updateLead = useMutation(api.leads.updateLead);
  const addComment = useMutation(api.leads.addComment);
  const createLead = useMutation(api.leads.createLead);

  const [selectedLead, setSelectedLead] = useState<Doc<"leads"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newComment, setNewComment] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const comments = useQuery(api.leads.getComments, selectedLead ? { leadId: selectedLead._id } : "skip");

  const filteredLeads = leads.filter(lead => 
    lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.mobile.includes(searchQuery)
  );

  const handleStatusChange = async (status: string) => {
    if (!selectedLead) return;
    await updateLead({ id: selectedLead._id, patch: { status } });
    toast.success("Status updated");
  };

  const handleTypeChange = async (type: string) => {
    if (!selectedLead) return;
    await updateLead({ id: selectedLead._id, patch: { type } });
    toast.success("Type updated");
  };

  const handleAddComment = async () => {
    if (!selectedLead || !newComment.trim()) return;
    await addComment({ leadId: selectedLead._id, content: newComment });
    setNewComment("");
    toast.success("Comment added");
  };

  const handleCreateLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
      });
      setIsCreateOpen(false);
      toast.success("Lead created successfully");
    } catch (error) {
      toast.error("Failed to create lead");
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">Manage your leads and communications.</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
          </div>
        </div>

        <div className="flex gap-6 flex-1 overflow-hidden">
          {/* Lead List */}
          <div className={`w-full md:w-1/3 flex flex-col gap-4 ${selectedLead ? 'hidden md:flex' : 'flex'}`}>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {filteredLeads.map((lead) => (
                <Card
                  key={lead._id}
                  className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                    selectedLead?._id === lead._id ? "border-primary bg-accent/50" : ""
                  }`}
                  onClick={() => setSelectedLead(lead)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold truncate">{lead.name}</h3>
                      <span className="text-xs text-muted-foreground">
                        {new Date(lead._creationTime).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mb-2">{lead.subject}</p>
                    <div className="flex gap-2 text-xs">
                      <span className="bg-secondary px-2 py-0.5 rounded-full">{lead.source}</span>
                      <span className={`px-2 py-0.5 rounded-full ${
                        lead.status === 'Hot' ? 'bg-red-100 text-red-700' :
                        lead.status === 'Mature' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{lead.status}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Lead Details */}
          {selectedLead ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-card border rounded-lg shadow-sm">
              <div className="p-6 border-b flex justify-between items-start bg-muted/10">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedLead(null)}>
                      <User className="h-4 w-4" />
                    </Button>
                    <h2 className="text-2xl font-bold">{selectedLead.name}</h2>
                    <span className="text-sm text-muted-foreground bg-background border px-2 py-1 rounded">
                      {selectedLead.source}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{selectedLead.subject}</p>
                </div>
                <div className="flex gap-2">
                  <Select value={selectedLead.status || "Cold"} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cold">Cold</SelectItem>
                      <SelectItem value="Hot">Hot</SelectItem>
                      <SelectItem value="Mature">Mature</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={selectedLead.type || "To be Decided"} onValueChange={handleTypeChange}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="To be Decided">To be Decided</SelectItem>
                      <SelectItem value="Relevant">Relevant</SelectItem>
                      <SelectItem value="Irrelevant">Irrelevant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <User className="h-4 w-4" /> Contact Details
                    </h3>
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedLead.mobile}</span>
                        {selectedLead.altMobile && <span className="text-muted-foreground">({selectedLead.altMobile})</span>}
                      </div>
                      {selectedLead.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a href={`mailto:${selectedLead.email}`} className="hover:underline">{selectedLead.email}</a>
                        </div>
                      )}
                      {selectedLead.agencyName && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Agency:</span>
                          <span>{selectedLead.agencyName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4" /> Location
                    </h3>
                    <div className="grid gap-2 text-sm">
                      <p>{[selectedLead.station, selectedLead.district, selectedLead.state, selectedLead.pincode].filter(Boolean).join(", ")}</p>
                    </div>
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="font-semibold mb-2">Message</h3>
                  <div className="bg-muted/30 p-4 rounded-md text-sm">
                    {selectedLead.message || "No message content."}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" /> Activity & Comments
                  </h3>
                  
                  <div className="space-y-4 mb-4">
                    {comments?.map((comment) => (
                      <div key={comment._id} className="bg-muted/30 p-3 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-sm">{comment.userName}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(comment._creationTime).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm">{comment.content}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[80px]"
                    />
                    <Button className="self-end" onClick={handleAddComment}>Post</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
              Select a lead to view details
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
