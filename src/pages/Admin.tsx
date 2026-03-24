import AppLayout from "@/components/AppLayout";
import BrevoKeyManager from "@/components/BrevoKeyManager";
import UserManagement from "@/components/admin/UserManagement";
import CreateUserDialog from "@/components/admin/CreateUserDialog";
import GeminiKeyManager from "@/components/GeminiKeyManager";
import { AllocateColdCallerDialog } from "@/components/admin/AllocateColdCallerDialog";
import { ProductUploadDialog } from "@/components/products/ProductUploadDialog";
import { ProductListManager } from "@/components/products/ProductListManager";
import { RangePdfUploadDialog } from "@/components/products/RangePdfUploadDialog";
import { RangePdfListManager } from "@/components/products/RangePdfListManager";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Shield, Download, FileUp, Phone, UserPlus, Users, RefreshCw, Mail } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { R2ManagementPanel } from "@/components/admin/R2ManagementPanel";
import { BackupManagement } from "@/components/admin/BackupManagement";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const api = getConvexApi() as any;
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import type { Id } from "@/convex/_generated/dataModel";
import * as Papa from "papaparse";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableBody, TableCell, TableHead } from "@/components/ui/table";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

// All available columns for export
const ALL_EXPORT_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "mobile", label: "Mobile" },
  { key: "altMobile", label: "Alt Mobile" },
  { key: "email", label: "Email" },
  { key: "altEmail", label: "Alt Email" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
  { key: "subject", label: "Subject" },
  { key: "message", label: "Message" },
  { key: "agencyName", label: "Agency Name" },
  { key: "state", label: "State" },
  { key: "district", label: "District" },
  { key: "station", label: "Station" },
  { key: "pincode", label: "Pincode" },
  { key: "assignedToName", label: "Assigned To" },
  { key: "nextFollowUpDate", label: "Next Follow-up Date" },
  { key: "lastActivity", label: "Last Activity" },
  { key: "pharmavendsUid", label: "Pharmavends UID" },
  { key: "indiamartUniqueId", label: "IndiaMART ID" },
  { key: "_creationTime", label: "Created At" },
];

interface User {
  _id: Id<"users">;
  name?: string;
  email?: string;
  role?: "admin" | "staff" | "uploader";
  image?: string;
  _creationTime: number;
}

export default function Admin() {
  const { user: currentUser } = useAuth();
  const users = useQuery(api.users.getAllUsers);
  const createUser = useMutation(api.users.createUser);
  const deleteUser = useMutation(api.users.deleteUser);
  const updateUserRole = useMutation(api.users.updateUserRole);
  const deduplicateLeads = useMutation(api.leads.deduplication.deduplicateLeads);
  
  const [activeTab, setActiveTab] = useState("users");
  const [deduplicationResult, setDeduplicationResult] = useState<any>(null);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [currentProcessId, setCurrentProcessId] = useState<string | null>(null);
  const [batchProcessResult, setBatchProcessResult] = useState<any>(null);
  const clearAllSummaries = useMutation(api.aiMutations.clearAllSummaries);
  const clearAllScores = useMutation(api.aiMutations.clearAllScores);
  const setBatchProcessStop = useMutation(api.aiMutations.setBatchProcessStop);
  const startBatchProcess = useMutation(api.aiMutations.startBatchProcess);

  // Import/Export state
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(["name", "mobile", "email", "source", "status", "type", "assignedToName", "state", "district"])
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [isMarkingColdCaller, setIsMarkingColdCaller] = useState(false);
  const [isSendingWelcome, setIsSendingWelcome] = useState(false);
  const [isAllocatingColdCaller, setIsAllocatingColdCaller] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [isSyncingPharmavends, setIsSyncingPharmavends] = useState(false);
  const [leadsPerStaff, setLeadsPerStaff] = useState("50");

  const exportAllLeads = useAction(api.leads.queries.exportAllLeads);
  const nextDownloadNumber = useQuery(api.leads.queries.getNextDownloadNumber);
  const logExport = useMutation(api.leads.admin.logExport);
  const bulkImportLeads = useMutation(api.leads.admin.bulkImportLeads);
  const standardizePhoneNumbers = useMutation(api.leads.admin.standardizeAllPhoneNumbers);
  const autoAssignLeads = useAction(api.leads.autoAssign.autoAssignLeads);
  const syncPharmavends = useAction(api.pharmavends.syncPharmavends);

  const batchProgress = useQuery(
    api.aiMutations.getBatchProgress,
    currentProcessId ? { processId: currentProcessId } : "skip"
  );

  const isBatchProcessing = batchProgress?.status === "queued" || batchProgress?.status === "running";

  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "uploader")) {
    return <div className="p-8 text-center">You do not have permission to view this page.</div>;
  }

  const handleCreateUser = async (userData: {
    email: string;
    name: string;
    password: string;
    role: "admin" | "staff" | "uploader";
  }) => {
    if (!currentUser) return;
    await createUser({
      ...userData,
      adminId: currentUser._id,
    });
  };

  const handleDeduplication = async (dryRun: boolean) => {
    if (!currentUser) return;
    setIsDeduplicating(true);
    setDeduplicationResult(null);
    
    try {
      const result = await deduplicateLeads({
        adminId: currentUser._id,
        dryRun,
      });
      setDeduplicationResult(result);
      
      if (!dryRun) {
        toast.success(`Deduplication complete! Deleted ${result.leadsDeleted} duplicate leads.`);
      } else {
        toast.info(`Dry run complete. Found ${result.duplicatesFound} sets of duplicates.`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to deduplicate leads");
    } finally {
      setIsDeduplicating(false);
    }
  };

  const handleBatchProcess = async (processType: "summaries" | "scores" | "both") => {
    if (!currentUser) return;
    setBatchProcessResult(null);

    const typeLabel = processType === "both" ? "summaries and scores" : processType;

    try {
      const { processId } = await startBatchProcess({ processType });
      setCurrentProcessId(processId);

      toast.success(`Batch processing started! Processing ${typeLabel} in the background. You can close this tab and it will continue running.`);
    } catch (error: any) {
      toast.error(error.message || "Failed to start batch processing");
    }
  };

  const handleForceStop = async () => {
    if (!currentProcessId) return;

    try {
      await setBatchProcessStop({ processId: currentProcessId });
      toast.info("Stopping batch processing after current batch completes...");
    } catch (error: any) {
      toast.error("Failed to stop batch processing");
    }
  };

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllColumns = () => {
    setSelectedColumns(new Set(ALL_EXPORT_COLUMNS.map(c => c.key)));
  };

  const deselectAllColumns = () => {
    setSelectedColumns(new Set());
  };

  const handleDownloadCSV = async () => {
    if (!currentUser) return;
    if (selectedColumns.size === 0) {
      toast.error("Please select at least one column to export");
      return;
    }

    setIsDownloading(true);
    try {
      toast.info("Fetching all leads including archived data, please wait...");
      const allLeadsForExport = await exportAllLeads({ userId: currentUser._id });

      const downloadNumber = nextDownloadNumber || 1;
      const fileName = `leads_export_${downloadNumber}_${new Date().toISOString().slice(0, 10)}.csv`;

      // Build rows with only selected columns
      const orderedColumns = ALL_EXPORT_COLUMNS.filter(c => selectedColumns.has(c.key));

      const phoneColumns = new Set(["mobile", "altMobile"]);

      // Use 2D array to guarantee exact column alignment
      const headerRow = orderedColumns.map(c => c.label);
      const dataRows = allLeadsForExport.map((lead: any) => {
        return orderedColumns.map(col => {
          let val = lead[col.key];
          // Format dates
          if ((col.key === "nextFollowUpDate" || col.key === "lastActivity" || col.key === "_creationTime") && typeof val === "number") {
            return new Date(val).toLocaleString();
          } else if (val === null || val === undefined) {
            return "";
          } else if (phoneColumns.has(col.key) && typeof val === "string" && val.length > 0) {
            // Use Excel formula ="number" to force text display and prevent scientific notation
            // This keeps column alignment intact (unlike \t prefix which shifts columns)
            const cleaned = val.replace(/[\r\n\t]+/g, "");
            return `="${cleaned}"`;
          }
          // Strip newlines, carriage returns, and tabs from all string values to prevent row breaks in CSV
          const strVal = String(val);
          return strVal.replace(/[\r\n\t]+/g, " ");
        });
      });

      const csv = Papa.unparse([headerRow, ...dataRows], { newline: "\r\n", quotes: true });
      // Add BOM for Excel UTF-8 compatibility
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);

      // Log the export
      await logExport({
        userId: currentUser._id,
        downloadNumber,
        fileName,
        leadCount: allLeadsForExport.length,
      });

      toast.success(`Downloaded ${allLeadsForExport.length} leads as ${fileName}`);
      setIsDownloadDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to download CSV");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const templateColumns = ["name", "mobile", "altMobile", "email", "altEmail", "source", "agencyName", "pincode", "station", "state", "district", "subject", "message", "assignedToName"];
    const csv = Papa.unparse([templateColumns.reduce((acc, col) => ({ ...acc, [col]: "" }), {})]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  };

  const handleImportCSV = async (file: File) => {
    if (!currentUser) return;
    setIsImporting(true);
    try {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const leads = (results.data as any[])
              .filter(row => row.mobile || row.Mobile)
              .map(row => ({
                name: row.name || row.Name || "Unknown",
                email: row.email || row.Email || undefined,
                altEmail: row.altEmail || row.AltEmail || undefined,
                mobile: String(row.mobile || row.Mobile || "").replace(/\D/g, ""),
                altMobile: row.altMobile || row.AltMobile ? String(row.altMobile || row.AltMobile || "").replace(/\D/g, "") : undefined,
                source: row.source || row.Source || undefined,
                assignedToName: row.assignedToName || row.AssignedToName || undefined,
                agencyName: row.agencyName || row.AgencyName || undefined,
                pincode: row.pincode || row.Pincode || undefined,
                station: row.station || row.Station || undefined,
                state: row.state || row.State || undefined,
                district: row.district || row.District || undefined,
                subject: row.subject || row.Subject || undefined,
                message: row.message || row.Message || undefined,
              }));

            if (leads.length === 0) {
              toast.error("No valid leads found in CSV (mobile column required)");
              setIsImporting(false);
              return;
            }

            const result = await bulkImportLeads({ leads, adminId: currentUser._id });
            toast.success(`Imported ${result.importedCount} leads, skipped ${result.skippedCount} duplicates`);
          } catch (err: any) {
            toast.error(err.message || "Failed to import leads");
          } finally {
            setIsImporting(false);
          }
        },
        error: () => {
          toast.error("Failed to parse CSV file");
          setIsImporting(false);
        }
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to import");
      setIsImporting(false);
    }
  };

  const handleStandardizePhoneNumbers = async () => {
    if (!currentUser) return;
    setIsStandardizing(true);
    try {
      const result = await standardizePhoneNumbers({ adminId: currentUser._id });
      toast.success(`Standardized ${result.updatedCount} numbers, found ${result.duplicatesFound} duplicates`);
    } catch (err: any) {
      toast.error(err.message || "Failed to standardize");
    } finally {
      setIsStandardizing(false);
    }
  };

  const handleAutoAssignLeads = async () => {
    if (!currentUser) return;
    setIsAutoAssigning(true);
    try {
      const result = await autoAssignLeads({ adminId: currentUser._id });
      toast.success(`Auto-assigned ${(result as any)?.assigned || 0} leads`);
    } catch (err: any) {
      toast.error(err.message || "Failed to auto-assign");
    } finally {
      setIsAutoAssigning(false);
    }
  };

  const handleSyncPharmavends = async () => {
    if (!currentUser) return;
    setIsSyncingPharmavends(true);
    try {
      const result = await syncPharmavends({ adminId: currentUser._id });
      toast.success(`Synced Pharmavends: ${(result as any)?.imported || 0} new leads`);
    } catch (err: any) {
      toast.error(err.message || "Failed to sync Pharmavends");
    } finally {
      setIsSyncingPharmavends(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex-wrap h-auto">
            {currentUser.role === "admin" && <TabsTrigger value="users">User Management</TabsTrigger>}
            {currentUser.role === "admin" && <TabsTrigger value="import-export">Import / Export</TabsTrigger>}
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="ranges">Range PDFs</TabsTrigger>
            {currentUser.role === "admin" && <TabsTrigger value="api-keys">API Keys</TabsTrigger>}
            {currentUser.role === "admin" && <TabsTrigger value="ai-batch">AI Batch Processing</TabsTrigger>}
            {currentUser.role === "admin" && <TabsTrigger value="deduplication">Deduplication</TabsTrigger>}
            {currentUser.role === "admin" && <TabsTrigger value="r2-tiering">R2 Data Tiering</TabsTrigger>}
            {currentUser.role === "admin" && <TabsTrigger value="backup">Backup & Restore</TabsTrigger>}
            {currentUser.role === "admin" && <TabsTrigger value="logs">System Logs</TabsTrigger>}
          </TabsList>

          {currentUser.role === "admin" && (
            <TabsContent value="users" className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Users</h2>
                <CreateUserDialog onCreateUser={handleCreateUser} />
              </div>
              
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users?.map((user: any) => (
                      <TableRow key={user._id}>
                        <TableCell className="font-medium">{user.name || "Unknown"}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Select
                            defaultValue={user.role}
                            onValueChange={(value: string) => 
                              updateUserRole({ userId: user._id, role: value })
                            }
                            disabled={user.email === "owner"}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="uploader">Uploader</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {new Date(user._creationTime).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive/90"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this user?")) {
                                deleteUser({ userId: user._id, adminId: currentUser._id });
                              }
                            }}
                            disabled={user.email === "owner" || user._id === currentUser._id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          )}

          {currentUser.role === "admin" && (
            <TabsContent value="import-export" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Import Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileUp className="h-5 w-5" />
                      Import Leads
                    </CardTitle>
                    <CardDescription>Upload CSV file to import leads</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid w-full items-center gap-1.5">
                      <Label htmlFor="csv-upload">CSV File</Label>
                      <Input
                        id="csv-upload"
                        type="file"
                        accept=".csv"
                        disabled={isImporting}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImportCSV(file);
                        }}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTemplate}
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Template
                    </Button>
                    {isImporting && (
                      <p className="text-sm text-muted-foreground text-center">Importing leads...</p>
                    )}
                  </CardContent>
                </Card>

                {/* Export Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Download className="h-5 w-5" />
                      Export Leads
                    </CardTitle>
                    <CardDescription>Download leads as CSV with selected columns</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => setIsDownloadDialogOpen(true)}
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export Leads (Select Columns)
                    </Button>
                  </CardContent>
                </Card>

                {/* Phone Numbers Card */}
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
                      onClick={handleStandardizePhoneNumbers}
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

                {/* Sync & Assign Card */}
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
                      onClick={handleSyncPharmavends}
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
                      onClick={handleAutoAssignLeads}
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
            </TabsContent>
          )}

          <TabsContent value="products">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Product Management</h2>
                <ProductUploadDialog />
              </div>
              <ProductListManager />
            </div>
          </TabsContent>

          <TabsContent value="ranges">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Range PDFs</h2>
                <RangePdfUploadDialog />
              </div>
              <RangePdfListManager />
            </div>
          </TabsContent>

          {currentUser.role === "admin" && (
            <TabsContent value="api-keys" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Brevo API Keys</CardTitle>
                </CardHeader>
                <CardContent>
                  <BrevoKeyManager userId={currentUser._id} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Gemini API Keys</CardTitle>
                </CardHeader>
                <CardContent>
                  <GeminiKeyManager userId={currentUser._id} />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {currentUser.role === "admin" && (
            <TabsContent value="ai-batch" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>AI Batch Processing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Process all leads to generate AI summaries and priority scores using Gemma 3 27B IT model.
                    Processing runs in the background - you can close this tab and it will continue. Each available API key processes one lead at a time in parallel.
                    Batches are processed sequentially with a 15-second cooldown between batches. WhatsApp chat history is included in the analysis.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleBatchProcess("summaries")}
                      disabled={isBatchProcessing}
                      variant="outline"
                    >
                      {isBatchProcessing ? "Processing..." : "Generate All Summaries"}
                    </Button>
                    <Button
                      onClick={() => handleBatchProcess("scores")}
                      disabled={isBatchProcessing}
                      variant="outline"
                    >
                      {isBatchProcessing ? "Processing..." : "Generate All Scores"}
                    </Button>
                    <Button
                      onClick={() => handleBatchProcess("both")}
                      disabled={isBatchProcessing}
                    >
                      {isBatchProcessing ? "Processing..." : "Generate Both (Summaries + Scores)"}
                    </Button>
                    {isBatchProcessing && (
                      <Button
                        onClick={handleForceStop}
                        variant="destructive"
                        disabled={!currentProcessId}
                      >
                        Force Stop
                      </Button>
                    )}
                  </div>

                  {batchProgress && (batchProgress.status === "queued" || batchProgress.status === "running" || batchProgress.status === "completed" || batchProgress.status === "stopped") && (
                    <div className={`p-4 rounded-md border ${
                      batchProgress.status === "completed" ? "bg-green-50 border-green-200" :
                      batchProgress.status === "stopped" ? "bg-yellow-50 border-yellow-200" :
                      "bg-muted/20"
                    }`}>
                      <h4 className="font-semibold mb-2">
                        Processing Status: {
                          batchProgress.status === "queued" ? "Queued" :
                          batchProgress.status === "running" ? "Running" :
                          batchProgress.status === "completed" ? "Completed" :
                          batchProgress.status === "stopped" ? "Stopped" :
                          "Unknown"
                        }
                      </h4>
                      <div className="space-y-1 text-sm">
                        <p>Processed: {batchProgress.processed}</p>
                        <p>Failed: {batchProgress.failed}</p>
                        <p>Total: {batchProgress.processed + batchProgress.failed}</p>
                      </div>
                      {(batchProgress.status === "queued" || batchProgress.status === "running") && (
                        <p className="text-xs text-muted-foreground mt-2">
                          This process will continue running even if you close this tab.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                    <Button
                      onClick={async () => {
                        if (confirm("Clear all AI summaries? This cannot be undone.")) {
                          await clearAllSummaries();
                          toast.success("All summaries cleared");
                        }
                      }}
                      disabled={isBatchProcessing}
                      variant="destructive"
                      size="sm"
                    >
                      Clear All Summaries
                    </Button>
                    <Button
                      onClick={async () => {
                        if (confirm("Clear all AI scores? This cannot be undone.")) {
                          await clearAllScores();
                          toast.success("All scores cleared");
                        }
                      }}
                      disabled={isBatchProcessing}
                      variant="destructive"
                      size="sm"
                    >
                      Clear All Scores
                    </Button>
                  </div>

                  <div className="mt-4 p-4 bg-muted/20 rounded-md">
                    <h4 className="font-semibold mb-2">How it works:</h4>
                    <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
                      <li>Runs in background - close tab anytime, processing continues</li>
                      <li>Each API key processes one lead at a time in parallel</li>
                      <li>Batch size equals number of available Gemini API keys</li>
                      <li>15-second cooldown between batches to prevent rate limiting</li>
                      <li>Force stop available to gracefully halt processing</li>
                      <li>Includes WhatsApp chat history in analysis</li>
                      <li>Summaries use recent comments and messages</li>
                      <li>Scores consider engagement, recency, and AI summary</li>
                      <li>Results are cached to avoid redundant processing</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {currentUser.role === "admin" && (
            <TabsContent value="deduplication" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lead Deduplication</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    This tool identifies and removes duplicate leads based on phone numbers. 
                    The oldest lead will be kept, and newer duplicates will be deleted.
                  </p>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleDeduplication(true)}
                      disabled={isDeduplicating}
                      variant="outline"
                    >
                      {isDeduplicating ? "Scanning..." : "Dry Run (Preview)"}
                    </Button>
                    <Button
                      onClick={() => handleDeduplication(false)}
                      disabled={isDeduplicating || !deduplicationResult}
                      variant="destructive"
                    >
                      {isDeduplicating ? "Processing..." : "Delete Duplicates"}
                    </Button>
                  </div>

                  {deduplicationResult && (
                    <Alert className={deduplicationResult.dryRun ? "border-blue-500" : "border-green-500"}>
                      {deduplicationResult.dryRun ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      <AlertDescription>
                        <div className="space-y-2">
                          <p className="font-semibold">
                            {deduplicationResult.dryRun ? "Preview Results:" : "Deduplication Complete!"}
                          </p>
                          <p>Found {deduplicationResult.duplicatesFound} sets of duplicate leads</p>
                          {deduplicationResult.dryRun ? (
                            <p>Would delete {deduplicationResult.totalLeadsToDelete} duplicate leads</p>
                          ) : (
                            <p>Deleted {deduplicationResult.leadsDeleted} duplicate leads</p>
                          )}
                          
                          {deduplicationResult.duplicates && deduplicationResult.duplicates.length > 0 && (
                            <div className="mt-4 space-y-2">
                              <p className="font-semibold text-sm">Sample duplicates (first 50):</p>
                              <div className="max-h-64 overflow-y-auto space-y-2">
                                {deduplicationResult.duplicates.map((dup: any, idx: number) => (
                                  <div key={idx} className="text-xs bg-muted p-2 rounded">
                                    <p className="font-medium">Phone: {dup.mobile}</p>
                                    <p className="text-muted-foreground">
                                      Keeping: {dup.leads[0].name} (oldest)
                                    </p>
                                    <p className="text-muted-foreground">
                                      {deduplicationResult.dryRun ? "Would delete" : "Deleted"}: {dup.deleteIds.length} duplicate(s)
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {currentUser.role === "admin" && (
            <TabsContent value="r2-tiering" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Hot/Cold Data Tiering (R2 Prototype)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <R2ManagementPanel />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {currentUser.role === "admin" && (
            <TabsContent value="backup" className="space-y-4">
              <BackupManagement />
            </TabsContent>
          )}
          
          {currentUser.role === "admin" && (
            <TabsContent value="logs">
               <div className="p-4 border rounded bg-muted/20">
                  <p className="text-muted-foreground">System logs are available in the Convex dashboard.</p>
                  <Button variant="outline" className="mt-4" asChild>
                    <a href="https://dashboard.convex.dev" target="_blank" rel="noopener noreferrer">
                      Open Convex Dashboard
                    </a>
                  </Button>
               </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Column Selection Dialog */}
      <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Columns to Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllColumns}>Select All</Button>
              <Button variant="outline" size="sm" onClick={deselectAllColumns}>Deselect All</Button>
              <span className="text-sm text-muted-foreground ml-auto self-center">
                {selectedColumns.size} of {ALL_EXPORT_COLUMNS.length} selected
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EXPORT_COLUMNS.map(col => (
                <div key={col.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${col.key}`}
                    checked={selectedColumns.has(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  <Label htmlFor={`col-${col.key}`} className="text-sm cursor-pointer">
                    {col.label}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Click Download CSV to fetch and export all leads (including archived R2 leads).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleDownloadCSV}
              disabled={isDownloading || selectedColumns.size === 0}
            >
              {isDownloading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}