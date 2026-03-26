import { Button } from "@/components/ui/button";
import { Check, CheckCheck, ExternalLink, Paperclip, PhoneCall, Reply } from "lucide-react";

type TemplateButtonData = {
  type?: string;
  text?: string;
  url?: string;
  phoneNumber?: string;
};

interface ChatMessageBubbleProps {
  message: any;
  selectedLeadName: string;
  onReply: (message: any) => void;
  formatTime: (timestamp: number) => string;
}

function getStatusIcon(status?: string) {
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
}

function getTemplateButtonHref(button: TemplateButtonData) {
  const buttonType = String(button.type || "").toUpperCase();

  if (buttonType === "URL" && button.url) {
    return button.url;
  }

  if (buttonType === "PHONE_NUMBER" && button.phoneNumber) {
    return `tel:${button.phoneNumber}`;
  }

  return null;
}

function renderMessageContent(message: any) {
  // Image: messageType === "image" OR mediaUrl with image mime type
  const isImage = message.messageType === "image" || 
    (message.mediaUrl && message.mediaMimeType?.startsWith("image/"));
  
  // File/document: messageType === "file" OR mediaUrl with non-image mime type
  const isFile = !isImage && (message.messageType === "file" || 
    (message.mediaUrl && message.mediaMimeType && !message.mediaMimeType.startsWith("image/")));

  if (isImage && message.mediaUrl) {
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

  if (isFile && message.mediaUrl) {
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

  // Fallback: if mediaUrl exists but no messageType, try to show as file link
  if (message.mediaUrl && !message.messageType) {
    const isLikelyImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(message.mediaUrl);
    if (isLikelyImage) {
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
    return (
      <div className="space-y-2">
        <a
          href={message.mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
        >
          <Paperclip className="h-4 w-4" />
          <span className="text-sm font-medium">{message.mediaName || "Attachment"}</span>
        </a>
        {message.content && <p className="text-sm text-gray-900">{message.content}</p>}
      </div>
    );
  }

  return <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{message.content}</p>;
}

export function ChatMessageBubble({
  message,
  selectedLeadName,
  onReply,
  formatTime,
}: ChatMessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const templateButtons: TemplateButtonData[] = Array.isArray(message.templateButtons)
    ? message.templateButtons.filter((button: TemplateButtonData) => Boolean(button?.text))
    : [];

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} group`}>
      <div className="flex items-end gap-2 max-w-[75%]">
        {!isOutbound && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 hover:bg-white shadow-sm rounded-full"
            onClick={() => onReply(message)}
            title="Reply"
          >
            <Reply className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}

        <div
          className={`rounded-2xl px-3.5 py-2 shadow-sm w-full ${
            isOutbound ? "bg-[#d9fdd3] rounded-br-sm" : "bg-white rounded-bl-sm"
          }`}
        >
          {message.quotedMessage && (
            <div className="mb-2 p-2 bg-black/5 rounded-xl border-l-4 border-primary/50 text-xs">
              <p className="font-semibold text-primary/80 mb-0.5">
                {message.quotedMessage.direction === "outbound" ? "You" : selectedLeadName}
              </p>
              <p className="truncate opacity-70">{message.quotedMessage.content || "Media"}</p>
            </div>
          )}

          {renderMessageContent(message)}

          {templateButtons.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-primary/70">
                {message.templateName ? `${message.templateName} buttons` : "Template buttons"}
              </div>

              {templateButtons.map((button, index) => {
                const href = getTemplateButtonHref(button);
                const buttonType = String(button.type || "QUICK_REPLY").toUpperCase();
                const content = (
                  <>
                    <span className="truncate">{button.text}</span>
                    {buttonType === "URL" ? (
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    ) : buttonType === "PHONE_NUMBER" ? (
                      <PhoneCall className="h-3.5 w-3.5 shrink-0" />
                    ) : null}
                  </>
                );

                if (href) {
                  return (
                    <a
                      key={`${button.text}-${index}`}
                      href={href}
                      target={buttonType === "URL" ? "_blank" : undefined}
                      rel={buttonType === "URL" ? "noopener noreferrer" : undefined}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-primary/15 bg-background/80 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                    >
                      {content}
                    </a>
                  );
                }

                return (
                  <div
                    key={`${button.text}-${index}`}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-primary/15 bg-background/80 px-3 py-2 text-xs font-medium text-primary/90 opacity-85"
                    title="Shown for reference in CRM"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-[10px] mt-1 text-gray-500 text-right flex items-center justify-end gap-1 font-medium">
            {formatTime(message._creationTime)}
            {isOutbound && getStatusIcon(message.status)}
          </div>
        </div>

        {isOutbound && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 hover:bg-white shadow-sm rounded-full"
            onClick={() => onReply(message)}
            title="Reply"
          >
            <Reply className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}
