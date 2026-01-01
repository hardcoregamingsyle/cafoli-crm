import { Button } from "@/components/ui/button";
import { Download, RefreshCw, Users, FolderClock } from "lucide-react";
import { useRef } from "react";

interface AdminActionsProps {
  onImportCSV: (file: File) => void;
  onDownloadTemplate: () => void;
  onStandardizePhoneNumbers: () => void;
  onMarkColdCallerLeads: () => void;
  onSendWelcomeMessages: () => void;
  onDownloadAllLeads: () => void;
  onAutoAssignLeads: () => void;
  isImporting: boolean;
  isStandardizing: boolean;
  isMarkingColdCaller: boolean;
  isSendingWelcome: boolean;
  isAutoAssigning: boolean;
}

export default function AdminActions({
  onImportCSV,
  onDownloadTemplate,
  onStandardizePhoneNumbers,
  onMarkColdCallerLeads,
  onSendWelcomeMessages,
  onDownloadAllLeads,
  isImporting,
  isStandardizing,
  isMarkingColdCaller,
  isSendingWelcome,
}: AdminActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportCSV(file);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        className="hidden"
      />

      <Button 
        variant="outline" 
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
      >
        <Users className={`mr-2 h-4 w-4 ${isImporting ? 'animate-spin' : ''}`} />
        {isImporting ? "Importing..." : "Import Leads CSV"}
      </Button>

      <Button variant="outline" onClick={onDownloadTemplate}>
        <Download className="mr-2 h-4 w-4" />
        Template
      </Button>

      <Button 
        variant="outline" 
        onClick={onStandardizePhoneNumbers}
        disabled={isStandardizing}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isStandardizing ? 'animate-spin' : ''}`} />
        {isStandardizing ? "Standardizing..." : "Standardize Phone Numbers"}
      </Button>

      <Button 
        variant="outline" 
        onClick={onMarkColdCallerLeads}
        disabled={isMarkingColdCaller}
      >
        <FolderClock className={`mr-2 h-4 w-4 ${isMarkingColdCaller ? 'animate-spin' : ''}`} />
        {isMarkingColdCaller ? "Marking..." : "Mark Cold Caller Leads"}
      </Button>

      <Button 
        variant="outline" 
        onClick={onSendWelcomeMessages}
        disabled={isSendingWelcome}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isSendingWelcome ? 'animate-spin' : ''}`} />
        {isSendingWelcome ? "Sending..." : "Send Welcome to Recent Leads"}
      </Button>

      <Button variant="outline" onClick={onDownloadAllLeads}>
        <Download className="mr-2 h-4 w-4" />
        Download All Leads CSV
      </Button>
    </div>
  );
}
