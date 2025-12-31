import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LeadActivityProps {
  comments: any[];
  newComment: string;
  setNewComment: (val: string) => void;
  onAddComment: () => void;
}

export function LeadActivity({ comments, newComment, setNewComment, onAddComment }: LeadActivityProps) {
  return (
    <div className="space-y-4 flex flex-col h-full">
      <h3 className="font-semibold flex items-center gap-2 text-primary">
        <MessageSquare className="h-4 w-4" /> Activity & Comments
      </h3>
      
      <ScrollArea className="flex-1 min-h-[200px] max-h-[400px] rounded-md border bg-muted/10 p-4">
        <div className="space-y-4">
          {comments?.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No comments yet. Start the conversation!
            </div>
          )}
          {comments?.map((comment: any) => (
            <div key={comment._id} className="bg-card p-3 rounded-lg border shadow-sm">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-sm text-primary">{comment.userName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(comment._creationTime).toLocaleString()}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex gap-2 pt-2">
        <Textarea
          placeholder="Add a comment or note..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="min-h-[80px] resize-none"
        />
        <Button className="self-end h-[80px]" onClick={onAddComment}>Post</Button>
      </div>
    </div>
  );
}
