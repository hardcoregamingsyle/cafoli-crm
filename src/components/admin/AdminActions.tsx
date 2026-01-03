import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download, FileUp, Phone, UserPlus, Users, RefreshCw, Mail } from "lucide-react";
import { useState } from "react";

export interface AdminActionsProps {
  onImportCSV: (file: File) => void;
  onDownloadTemplate: () => void;
  onStandardizePhoneNumbers: () => Promise<void>;
  onMarkColdCallerLeads: () => Promise<void>;
  onSendWelcomeToRecentLeads: () => Promise<void>;
  onAllocateColdCallerLeads: (leadsPerStaff: number) => Promise<void>;
  onAutoAssignLeads: () => Promise<void>;
  onSyncPharmavends: () => Promise<void>;
  onDownloadCSV: () => Promise<void>;
  isStandardizing: boolean;
  isImporting: boolean;
  isMarkingColdCaller: boolean;
  isSendingWelcome: boolean;
  isAllocatingColdCaller: boolean;
  isAutoAssigning: boolean;
  isSyncingPharmavends: boolean;
  unallocatedColdCallerCount?: number;
}

export default function AdminActions({
  onImportCSV,
  onDownloadTemplate,
  onStandardizePhoneNumbers,
  onMarkColdCallerLeads,
  onSendWelcomeToRecentLeads,
  onAllocateColdCallerLeads,
  onAutoAssignLeads,
  onSyncPharmavends,
  onDownloadCSV,
  isStandardizing,
  isImporting,
  isMarkingColdCaller,
  isSendingWelcome,
  isAllocatingColdCaller,
  isAutoAssigning,
  isSyncingPharmavends,
  unallocatedColdCallerCount = 0,
}: AdminActionsProps) {
  const [leadsPerStaff, setLeadsPerStaff] = useState<string>("50");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportCSV(file);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Import Leads
          </CardTitle>
          <CardDescription>Upload CSV file to import leads</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="csv-upload">CSV File</Label>
            <Input 
              id="csv-upload" 
              type="file" 
              accept=".csv"
              onChange={handleFileChange}
              disabled={isImporting}
            />
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onDownloadTemplate}
            className="w-full"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Leads
          </CardTitle>
          <CardDescription>Download all leads as CSV</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => onDownloadCSV()} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Export All Leads
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Numbers
          </CardTitle>
          <CardDescription>Standardize formats & check duplicates</CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => onStandardizePhoneNumbers()} 
            disabled={isStandardizing}
            className="w-full"
          >
            {isStandardizing ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Phone className="mr-2 h-4 w-4" />
            )}
            Standardize Numbers
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Welcome Emails
          </CardTitle>
          <CardDescription>Send welcome emails to recent leads</CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => onSendWelcomeToRecentLeads()} 
            disabled={isSendingWelcome}
            className="w-full"
          >
            {isSendingWelcome ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Send Welcome Emails
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Cold Caller Allocation
          </CardTitle>
          <CardDescription>
            {unallocatedColdCallerCount} unallocated leads available
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={() => onMarkColdCallerLeads()} 
            disabled={isMarkingColdCaller}
            variant="outline"
            className="w-full"
          >
            {isMarkingColdCaller ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh Cold Caller Pool
          </Button>
          
          <Separator />
          
          <div className="space-y-2">
            <Label htmlFor="leads-per-staff">Leads per Staff</Label>
            <div className="flex gap-2">
              <Input 
                id="leads-per-staff" 
                type="number" 
                value={leadsPerStaff}
                onChange={(e) => setLeadsPerStaff(e.target.value)}
                min="1"
              />
              <Button 
                onClick={() => onAllocateColdCallerLeads(parseInt(leadsPerStaff) || 50)}
                disabled={isAllocatingColdCaller}
              >
                {isAllocatingColdCaller ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Sync & Assign
          </CardTitle>
          <CardDescription>External sources & auto-assignment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={() => onSyncPharmavends()} 
            disabled={isSyncingPharmavends}
            variant="outline"
            className="w-full"
          >
            {isSyncingPharmavends ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Pharmavends
          </Button>

          <Button 
            onClick={() => onAutoAssignLeads()} 
            disabled={isAutoAssigning}
            className="w-full"
          >
            {isAutoAssigning ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Auto-Assign Leads
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}