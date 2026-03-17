import { TemplatesDialog } from "@/components/TemplatesDialog";
import { QuickRepliesDialog } from "./QuickRepliesDialog";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { getConvexApi } from "@/lib/convex-api";

const api = getConvexApi() as any;
import { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import { MessageSquare, MoreVertical, Paperclip, Phone, Send, Smile, Video, X, AlertTriangle, ImageIcon, HelpCircle, FileText, Sparkles, Loader2, ArrowLeft } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

interface ChatWindowProps {
  selectedLeadId: Id<"leads">;
  selectedLead: any;
  onBack?: () => void;
}

export function ChatWindow({ selectedLeadId, selectedLead, onBack }: ChatWindowProps) {
  const { user } = useAuth();

  // Use paginated query for messages (100 items per page, loaded latest first)
  const { results: messagesResult, status, loadMore } = usePaginatedQuery(
    api.whatsappQueries.getChatMessages,
    { leadId: selectedLeadId },
    { initialNumItems: 100 }
  );

  // Fix: correctly access results and reverse for display (Oldest -> Newest)
  // usePaginatedQuery returns results in the order fetched (Newest -> Oldest due to desc order)
  // We reverse it so the oldest messages are at the top of the chat window
  const messages = messagesResult ? [...messagesResult].reverse() : [];
  const canLoadMore = status === "CanLoadMore";
  const isLoadingMessages = status === "LoadingFirstPage" || status === "LoadingMore";
  
  const sendWhatsAppMessage = useAction(api.whatsapp.messages.send);
  const sendWhatsAppMedia = useAction(api.whatsapp.messages.sendMedia);
  const generateUploadUrl = useMutation(api.whatsappStorage.generateUploadUrl);
  const markChatAsRead = useMutation(api.whatsappMutations.markChatAsRead);
  const generateAndSendAiReply = useAction(api.whatsappAi.generateAndSendAiReply);
  const generateSummary = useAction(api.whatsappAi.generateChatSummary);
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
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previousScrollHeight, setPreviousScrollHeight] = useState(0);

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

  // Intersection Observer for loading older messages
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && canLoadMore && !isLoadingMessages) {
          // Save current scroll height before loading more
          if (messagesContainerRef.current) {
            setPreviousScrollHeight(messagesContainerRef.current.scrollHeight);
          }
          loadMore(50); // Load 50 more messages
        }
      },
      { threshold: 0.5, root: messagesContainerRef.current }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [canLoadMore, isLoadingMessages, loadMore]);

  // Maintain scroll position after loading older messages
  useEffect(() => {
    if (messagesContainerRef.current && previousScrollHeight > 0) {
      const newScrollHeight = messagesContainerRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - previousScrollHeight;
      if (scrollDiff > 0) {
        messagesContainerRef.current.scrollTop += scrollDiff;
        setPreviousScrollHeight(0);
      }
    }
  }, [messages.length, previousScrollHeight]);

  // Auto-scroll to bottom when new messages arrive or replying
  useEffect(() => {
    // Only auto-scroll if we're near the bottom or it's a new message
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

      if (isNearBottom || replyingTo) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
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

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    setShowSummaryDialog(true);
    setSummaryText(null);
    try {
      const summary = await generateSummary({ leadId: selectedLeadId });
      setSummaryText(summary);
    } catch (error) {
      toast.error("Failed to generate summary");
      setShowSummaryDialog(false);
    } finally {
      setIsGeneratingSummary(false);
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

  const formatMessageDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isSameDay = (d1: Date, d2: Date) => 
      d1.getDate() === d2.getDate() && 
      d1.getMonth() === d2.getMonth() && 
      d1.getFullYear() === d2.getFullYear();

    if (isSameDay(date, today)) {
      return "Today";
    } else if (isSameDay(date, yesterday)) {
      return "Yesterday";
    }

    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    }

    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-background">
      <div className="h-16 border-b px-2 md:px-4 flex items-center justify-between flex-shrink-0 bg-background z-10 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" className="md:hidden h-9 w-9" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-10 w-10 border shadow-sm">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {getInitials(selectedLead.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-semibold text-sm">{selectedLead.name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              {selectedLead.mobile}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-primary hidden sm:flex items-center gap-1"
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
          >
            {isGeneratingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            <span className="text-xs font-medium">Summary</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground sm:hidden" onClick={handleGenerateSummary}>
            <FileText className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 bg-[#efeae2] relative min-h-0">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }}
        />
        <div className="space-y-4 relative z-10 max-w-3xl mx-auto">
          {/* Load more trigger for older messages */}
          {canLoadMore && (
            <div ref={loadMoreRef} className="flex justify-center py-3">
              <div className="bg-white/80 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Loading older messages...</span>
              </div>
            </div>
          )}
          {isLoadingMessages && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground font-medium">Loading conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="bg-white/50 p-6 rounded-full mb-4">
                <MessageSquare className="h-12 w-12 text-primary/40" />
              </div>
              <p className="text-muted-foreground font-medium">No messages yet</p>
              <p className="text-sm text-muted-foreground mt-1">Send a message to start the conversation</p>
            </div>
          ) : (
            messages.map((message: any, index: number) => {
              const showDateSeparator = index === 0 || formatMessageDate(message._creationTime) !== formatMessageDate(messages[index - 1]._creationTime);
              const dateLabel = formatMessageDate(message._creationTime);

              return (
                <React.Fragment key={message._id}>
                  {showDateSeparator && (
                    <div className="flex justify-center my-4">
                      <div className="bg-blue-100/80 backdrop-blur-sm text-blue-800 text-xs font-medium px-3 py-1 rounded-md shadow-sm">
                        {dateLabel}
                      </div>
                    </div>
                  )}
                  <ChatMessageBubble
                    message={message}
                    selectedLeadName={selectedLead.name}
                    onReply={setReplyingTo}
                    formatTime={formatTime}
                  />
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-3 flex-shrink-0 bg-[#f0f2f5] relative">
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
          <div className="mb-2 flex items-center gap-2 p-3 bg-white rounded-xl shadow-sm border-l-4 border-primary mx-2">
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-primary mb-0.5">
                Replying to {replyingTo.direction === "outbound" ? "yourself" : selectedLead.name}
              </p>
              <p className="text-sm truncate text-muted-foreground">
                {replyingTo.content || (replyingTo.mediaName ? "File/Media" : "Message")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full hover:bg-muted"
              onClick={() => setReplyingTo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {selectedFile && (
          <div className="mb-2 flex items-center gap-2 p-3 bg-white rounded-xl shadow-sm mx-2">
            <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Paperclip className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm flex-1 truncate font-medium">{selectedFile.name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
        <div className="flex flex-col sm:flex-row items-end gap-2 max-w-4xl mx-auto">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          />
          <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-1 bg-white rounded-full shadow-sm p-1 mb-2 sm:mb-0">
            <Button 
              variant="ghost" 
              size="icon"
              className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
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
              className={`h-10 w-10 rounded-full ${isGeneratingAi ? "text-purple-600 bg-purple-50 animate-pulse" : "text-muted-foreground hover:text-purple-600 hover:bg-purple-50"}`}
              title="Generate AI Reply"
              onClick={handleAiReply}
              disabled={isSending || isUploading || !isWithinWindow || isGeneratingAi}
            >
              <Sparkles className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex w-full items-end gap-2">
            <div className="flex-1 relative flex items-center bg-white rounded-2xl shadow-sm">
              <Button 
                variant="ghost" 
                size="icon"
                className="absolute left-1 h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted hidden sm:flex"
                title="Add emoji"
                disabled={!isWithinWindow}
              >
                <Smile className="h-5 w-5" />
              </Button>
              <Input
                placeholder={isWithinWindow ? "Type a message or / for commands..." : "Session expired. Send a template."}
                value={whatsappMessage}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                className="pl-3 sm:pl-12 pr-4 py-6 border-none bg-transparent focus-visible:ring-0 text-base"
                disabled={isSending || isUploading || !isWithinWindow || isGeneratingAi}
              />
            </div>
            <Button 
              onClick={handleSendWhatsApp} 
              disabled={isSending || isUploading || (!whatsappMessage.trim() && !selectedFile) || !isWithinWindow}
              size="icon"
              className="h-12 w-12 rounded-full shadow-sm flex-shrink-0"
            >
              <Send className="h-5 w-5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Chat Summary</DialogTitle>
            <DialogDescription>
              AI-generated summary of the conversation with {selectedLead.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-[150px] flex items-center justify-center p-4 bg-muted/30 rounded-md">
            {isGeneratingSummary ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm">Analyzing conversation...</p>
              </div>
            ) : (
              <div className="text-sm whitespace-pre-wrap w-full">
                {summaryText}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}