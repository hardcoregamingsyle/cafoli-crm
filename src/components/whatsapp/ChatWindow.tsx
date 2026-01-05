import { TemplatesDialog } from "@/components/TemplatesDialog";
import { QuickRepliesDialog } from "./QuickRepliesDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Check, CheckCheck, MessageSquare, MoreVertical, Paperclip, Phone, Reply, Send, Smile, Video, X, AlertTriangle, ImageIcon, HelpCircle, FileText, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface ChatWindowProps {
  selectedLeadId: Id<"leads">;
  selectedLead: any;
}

export function ChatWindow({ selectedLeadId, selectedLead }: ChatWindowProps) {
  const { user } = useAuth();
  const messages = useQuery(api.whatsappQueries.getChatMessages, { leadId: selectedLeadId }) || [];
  
  const sendWhatsAppMessage = useAction(api.whatsapp.messages.send);
  const sendWhatsAppMedia = useAction(api.whatsapp.messages.sendMedia);
  const generateUploadUrl = useMutation(api.whatsappStorage.generateUploadUrl);
  const markChatAsRead = useMutation(api.whatsappMutations.markChatAsRead);
  const generateAndSendAiReply = useAction(api.whatsappAi.generateAndSendAiReply);
  const incrementQuickReplyUsage = useMutation(api.quickReplies.incrementUsage);
  const updateActiveSession = useMutation(api.activeChatSessions.updateActiveSession);
  const removeActiveSession = useMutation(api.activeChatSessions.removeActiveSession);

  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [showCommandMenu, setShowCommandMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update active session when chat is opened and periodically
  useEffect(() => {
    if (!user || !selectedLeadId) return;

    // Mark session as active immediately
    updateActiveSession({ leadId: selectedLeadId, userId: user._id });

    // Update every 15 seconds to keep session alive
    const interval = setInterval(() => {
      updateActiveSession({ leadId: selectedLeadId, userId: user._id });
    }, 15000);

    // Cleanup on unmount or when lead changes
    return () => {
      clearInterval(interval);
      removeActiveSession({ leadId: selectedLeadId, userId: user._id });
    };
  }, [selectedLeadId, user, updateActiveSession, removeActiveSession]);

  // Update time every minute to keep window status accurate
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate 24h window status (23h 30m)
  const lastInboundMessage = messages
    .filter((m: any) => m.direction === "inbound")
    .pop();
    
  const lastInboundTime = lastInboundMessage ? lastInboundMessage._creationTime : 0;
  const windowDuration = (23 * 60 + 30) * 60 * 1000; // 23h 30m
  const isWithinWindow = (now - lastInboundTime) < windowDuration;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, replyingTo]);

  // Mark as read when selecting a lead
  useEffect(() => {
    if (selectedLeadId && (selectedLead?.unreadCount ?? 0) > 0) {
      markChatAsRead({ leadId: selectedLeadId });
    }
  }, [selectedLeadId, selectedLead?.unreadCount, markChatAsRead]);

  // Handle input change to detect slash commands
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWhatsappMessage(value);
    setShowCommandMenu(value.startsWith("/"));
  };

  const handleCommandSelect = (command: string, payload?: string) => {
    if (command === "image") {
      fileInputRef.current?.click();
      setWhatsappMessage("");
    } else if (command === "faq") {
      setWhatsappMessage(payload || "");
    }
    setShowCommandMenu(false);
    // Focus back on input
    setTimeout(() => {
      const input = document.querySelector('input[placeholder="Type a message..."]') as HTMLInputElement;
      if (input) input.focus();
    }, 10);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 16 * 1024 * 1024) {
        toast.error("File size must be less than 16MB");
        return;
      }
      setSelectedFile(file);
      toast.success(`Selected: ${file.name}`);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!selectedLead) {
      toast.error("Please select a contact");
      return;
    }

    if (!isWithinWindow) {
      toast.error("Session expired. Please send a template.");
      return;
    }

    if (selectedFile) {
      setIsUploading(true);
      setIsSending(true);
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });
        
        const { storageId } = await result.json();
        
        await sendWhatsAppMedia({
          phoneNumber: selectedLead.mobile,
          message: whatsappMessage.trim() || undefined,
          leadId: selectedLead._id,
          storageId,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
        });
        
        setWhatsappMessage("");
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        toast.success("Media sent successfully");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send media");
      } finally {
        setIsUploading(false);
        setIsSending(false);
      }
      return;
    }

    if (!whatsappMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }
    
    setIsSending(true);
    try {
      await sendWhatsAppMessage({
        phoneNumber: selectedLead.mobile,
        message: whatsappMessage,
        leadId: selectedLead._id,
        quotedMessageId: replyingTo?._id,
        quotedMessageExternalId: replyingTo?.externalId,
      });
      setWhatsappMessage("");
      setReplyingTo(null);
      toast.success("Message sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleAiReply = async () => {
    if (!user || !selectedLead) return;
    
    // Get last 10 messages for context
    const recentMessages = messages.slice(-10).map((m: any) => ({
      role: m.direction === "outbound" ? "assistant" : "user",
      content: m.content
    }));

    setIsGeneratingAi(true);
    try {
      await generateAndSendAiReply({
        prompt: "Draft a reply to this conversation",
        context: { 
          leadName: selectedLead.name,
          recentMessages 
        },
        userId: user._id,
        leadId: selectedLead._id,
        phoneNumber: selectedLead.mobile,
        replyingToMessageId: replyingTo?._id,
        replyingToExternalId: replyingTo?.externalId,
      });
      
      setWhatsappMessage("");
      setReplyingTo(null);
      toast.success("AI reply sent automatically");
    } catch (error) {
      toast.error("Failed to generate and send AI reply");
      console.error(error);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleQuickReplySelect = async (message: string, quickReplyId: Id<"quickReplies">) => {
    setWhatsappMessage(message);
    await incrementQuickReplyUsage({ id: quickReplyId });
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <Check className="h-3 w-3 inline ml-1 text-gray-500" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 inline ml-1 text-gray-500" />;
      case "read":
        return <CheckCheck className="h-3 w-3 inline ml-1 text-blue-500" />;
      default:
        return null;
    }
  };

  const renderMessageContent = (message: any) => {
    if (message.messageType === "image" && message.mediaUrl) {
      return (
        <div className="space-y-2">
          <img 
            src={message.mediaUrl} 
            alt={message.mediaName || "Image"} 
            className="rounded-lg max-w-full h-auto max-h-64 object-cover"
          />
          {message.content && <p className="text-sm text-gray-900">{message.content}</p>}
        </div>
      );
    }
    
    if (message.messageType === "file" && message.mediaUrl) {
      return (
        <div className="space-y-2">
          <a 
            href={message.mediaUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 p-2 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            <Paperclip className="h-4 w-4" />
            <span className="text-sm font-medium">{message.mediaName || "File"}</span>
          </a>
          {message.content && <p className="text-sm text-gray-900">{message.content}</p>}
        </div>
      );
    }
    
    return <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{message.content}</p>;
  };

  return (
    <Card className="flex flex-col h-full overflow-hidden relative">
      <CardHeader className="border-b py-3 flex-shrink-0">
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

      <div className="flex-1 overflow-y-auto p-4 bg-[#efeae2] relative min-h-0">
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
            messages.map((message: any) => (
              <div
                key={message._id}
                className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"} group`}
              >
                <div className="flex items-end gap-2 max-w-[70%]">
                  {message.direction === "inbound" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setReplyingTo(message)}
                      title="Reply"
                    >
                      <Reply className="h-3 w-3" />
                    </Button>
                  )}
                  <div
                    className={`rounded-lg px-3 py-2 shadow-sm w-full ${
                      message.direction === "outbound"
                        ? "bg-[#d9fdd3]"
                        : "bg-white"
                    }`}
                  >
                    {message.quotedMessage && (
                      <div className="mb-2 p-2 bg-black/5 rounded border-l-4 border-primary/50 text-xs">
                        <p className="font-semibold text-primary/80">
                          {message.quotedMessage.direction === "outbound" ? "You" : selectedLead.name}
                        </p>
                        <p className="truncate opacity-70">{message.quotedMessage.content || "Media"}</p>
                      </div>
                    )}
                    {renderMessageContent(message)}
                    <div className="text-[11px] mt-1 text-gray-500 text-right flex items-center justify-end gap-1">
                      {formatTime(message._creationTime)}
                      {message.direction === "outbound" && getStatusIcon(message.status)}
                    </div>
                  </div>
                  {message.direction === "outbound" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setReplyingTo(message)}
                      title="Reply"
                    >
                      <Reply className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t p-4 flex-shrink-0 bg-background relative">
        {/* Command Menu */}
        {showCommandMenu && (
          <div className="absolute bottom-full left-4 mb-2 w-64 bg-popover border rounded-md shadow-md z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
            <Command>
              <CommandList>
                <CommandGroup heading="Commands">
                  <CommandItem onSelect={() => handleCommandSelect("image")} className="cursor-pointer">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span>/image</span>
                    <span className="ml-auto text-xs text-muted-foreground">Upload image</span>
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading="Frequently Asked Questions">
                  <CommandItem onSelect={() => handleCommandSelect("faq", "Our business hours are Mon-Fri, 9 AM - 6 PM.")} className="cursor-pointer">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>Business Hours</span>
                  </CommandItem>
                  <CommandItem onSelect={() => handleCommandSelect("faq", "We are located at 123 Business Park, Tech City.")} className="cursor-pointer">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>Location</span>
                  </CommandItem>
                  <CommandItem onSelect={() => handleCommandSelect("faq", "You can view our pricing plans at example.com/pricing")} className="cursor-pointer">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>Pricing</span>
                  </CommandItem>
                  <CommandItem onSelect={() => handleCommandSelect("faq", "We offer a wide range of services including consulting, development, and support.")} className="cursor-pointer">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>Services</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}

        {!isWithinWindow && (
          <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Session expired. Please send a template to resume the conversation.</span>
          </div>
        )}
        
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 p-2 bg-muted rounded-lg border-l-4 border-primary">
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-primary">
                Replying to {replyingTo.direction === "outbound" ? "yourself" : selectedLead.name}
              </p>
              <p className="text-sm truncate text-muted-foreground">
                {replyingTo.content || (replyingTo.mediaName ? "File/Media" : "Message")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setReplyingTo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {selectedFile && (
          <div className="mb-2 flex items-center gap-2 p-2 bg-muted rounded-lg">
            <Paperclip className="h-4 w-4" />
            <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
            >
              Remove
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          />
          <Button 
            variant="ghost" 
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:text-foreground"
            title="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isUploading || !isWithinWindow}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          
          <QuickRepliesDialog 
            onSelectReply={handleQuickReplySelect}
            disabled={!isWithinWindow}
          />
          
          <TemplatesDialog selectedLeadId={selectedLeadId} />
          
          <Button
            variant="ghost"
            size="icon"
            className={`h-10 w-10 ${isGeneratingAi ? "text-purple-600 animate-pulse" : "text-muted-foreground hover:text-purple-600"}`}
            title="Generate AI Reply"
            onClick={handleAiReply}
            disabled={isSending || isUploading || !isWithinWindow || isGeneratingAi}
          >
            <Sparkles className="h-5 w-5" />
          </Button>

          <div className="flex-1 relative">
            <Input
              placeholder={isWithinWindow ? "Type a message or / for commands..." : "Session expired. Send a template."}
              value={whatsappMessage}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              className="pr-10"
              disabled={isSending || isUploading || !isWithinWindow || isGeneratingAi}
            />
            <Button 
              variant="ghost" 
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Add emoji"
              disabled={!isWithinWindow}
            >
              <Smile className="h-5 w-5" />
            </Button>
          </div>
          <Button 
            onClick={handleSendWhatsApp} 
            disabled={isSending || isUploading || (!whatsappMessage.trim() && !selectedFile) || !isWithinWindow}
            size="icon"
            className="h-10 w-10"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}