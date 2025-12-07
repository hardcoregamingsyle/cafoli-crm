import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

export default function WhatsApp() {
  return (
    <AppLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground">Chat with your leads directly.</p>
        </div>

        <Card className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/10 border-dashed">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium mb-2">WhatsApp Integration</h3>
            <p className="max-w-md mx-auto">
              This module will be connected to the Meta WhatsApp API. 
              Chats will appear here once the integration is configured.
            </p>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
