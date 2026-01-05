import AppLayout from "@/components/AppLayout";
import BrevoKeyManager from "@/components/BrevoKeyManager";
import UserManagement from "@/components/admin/UserManagement";
import CreateUserDialog from "@/components/admin/CreateUserDialog";
import AdminActions from "@/components/admin/AdminActions";
import GeminiKeyManager from "@/components/GeminiKeyManager";
import { AllocateColdCallerDialog } from "@/components/admin/AllocateColdCallerDialog";
import { ProductUploadDialog } from "@/components/products/ProductUploadDialog";
import { ProductListManager } from "@/components/products/ProductListManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import type { Id } from "@/convex/_generated/dataModel";
import JSZip from "jszip";
import * as Papa from "papaparse";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export default function Admin() {
  const { user: currentUser, signIn } = useAuth();
  const allUsers = useQuery(api.users.getAllUsers, currentUser ? { userId: currentUser._id } : "skip") || [];
  const allLeadsForExport = useQuery(api.leadQueries.getAllLeadsForExport, currentUser ? { userId: currentUser._id } : "skip");
  const nextDownloadNumber = useQuery(api.leadQueries.getNextDownloadNumber);
  const unallocatedColdCallerCount = useQuery(
    api.coldCallerLeads.getUnallocatedColdCallerCount,
    currentUser ? { adminId: currentUser._id } : "skip"
  );
  
  const createUser = useMutation(api.users.createUser);
  const deleteUser = useMutation(api.users.deleteUser);
  const logExport = useMutation(api.leads.admin.logExport);
  const standardizePhoneNumbers = useMutation(api.leads.admin.standardizeAllPhoneNumbers);
  const importLeads = useMutation(api.leads.admin.bulkImportLeads);
  const manualMarkColdCallerLeads = useMutation(api.coldCallerLeads.manualMarkColdCallerLeads);
  const manualAllocateColdCallerLeads = useMutation(api.coldCallerLeads.manualAllocateColdCallerLeads);
  const sendWelcomeToRecentLeads = useAction(api.brevo.sendWelcomeEmailToRecentLeads);
  const autoAssignUnassignedLeads = useMutation(api.leads.autoAssign.autoAssignUnassignedLeads);
  const syncPharmavends = useAction(api.pharmavends.manualSyncPharmavends);
  const sendTestReport = useAction(api.reportPdfGenerator.sendTestReport);

  const [isStandardizing, setIsStandardizing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isMarkingColdCaller, setIsMarkingColdCaller] = useState(false);
  const [isSendingWelcome, setIsSendingWelcome] = useState(false);
  const [isAllocatingColdCaller, setIsAllocatingColdCaller] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [isSyncingPharmavends, setIsSyncingPharmavends] = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);

  const handleCreateUser = async (userData: {
    email: string;
    name: string;
    password: string;
    role: "admin" | "staff";
  }) => {
    if (!currentUser) {
      throw new Error("You must be logged in");
    }

    await createUser({
      email: userData.email,
      name: userData.name,
      password: userData.password,
      role: userData.role,
      adminId: currentUser._id,
    });
  };

  const handleDeleteUser = async (userId: Id<"users">) => {
    if (!currentUser) return;
    try {
      await deleteUser({ userId, adminId: currentUser._id });
      toast.success("User deleted successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    }
  };

  const handleLoginAs = async (email: string) => {
    try {
      const userToLogin = allUsers.find((u: any) => u.email === email);
      if (!userToLogin || !userToLogin.passwordHash) {
        toast.error("Cannot log in as this user - no password set");
        return;
      }
      
      await signIn(email.toLowerCase(), userToLogin.passwordHash);
      toast.success(`Logged in as ${email}`);
    } catch (error) {
      toast.error("Failed to log in as user. Please use their actual credentials.");
    }
  };

  const handleStandardizePhoneNumbers = async () => {
    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    setIsStandardizing(true);
    try {
      const result = await standardizePhoneNumbers({ adminId: currentUser._id });
      toast.success(
        `Phone numbers standardized successfully!\n${result.updatedCount} leads updated, ${result.duplicatesFound} duplicates flagged for review.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to standardize phone numbers");
    } finally {
      setIsStandardizing(false);
    }
  };

  const handleSyncPharmavends = async () => {
    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    setIsSyncingPharmavends(true);
    try {
      const result = await syncPharmavends({});
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync Pharmavends leads");
    } finally {
      setIsSyncingPharmavends(false);
    }
  };

  const handleManualMarkColdCallerLeads = async () => {
    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    setIsMarkingColdCaller(true);
    try {
      const result = await manualMarkColdCallerLeads({ adminId: currentUser._id });
      toast.success(
        `Cold Caller Leads marked successfully!\n${result.markedCount} leads newly marked\n${result.alreadyMarked} already marked\n${result.totalUnassigned} total unassigned leads checked`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark cold caller leads");
    } finally {
      setIsMarkingColdCaller(false);
    }
  };

  const handleSendWelcomeToRecentLeads = async () => {
    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    setIsSendingWelcome(true);
    try {
      const result = await sendWelcomeToRecentLeads({});
      toast.success(
        `Welcome emails sent successfully!\n${result.emailsSent} emails sent to ${result.leadsProcessed} leads\n${result.errors} errors`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send welcome messages");
    } finally {
      setIsSendingWelcome(false);
    }
  };

  const handleAllocateColdCallerLeads = async (leadsPerStaff: number) => {
    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    setIsAllocatingColdCaller(true);
    try {
      const result = await manualAllocateColdCallerLeads({
        adminId: currentUser._id,
        leadsPerStaff,
      });
      toast.success(
        `Cold Caller Leads allocated successfully!\n${result.allocatedCount} leads allocated to ${result.staffCount} staff members\n(${result.availableLeads} available, ${result.requested} requested)`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to allocate cold caller leads");
    } finally {
      setIsAllocatingColdCaller(false);
    }
  };

  const handleAutoAssignLeads = async () => {
    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    setIsAutoAssigning(true);
    try {
      const result = await autoAssignUnassignedLeads({ adminId: currentUser._id });
      toast.success(
        `Auto-assignment completed!\n${result.assignedCount} leads assigned to ${result.staffCount} staff members`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to auto-assign leads");
    } finally {
      setIsAutoAssigning(false);
    }
  };

  const handleSendTestReport = async () => {
    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    console.log("Sending test report to info@cafoli.in");

    setIsSendingReport(true);
    try {
      const result = await sendTestReport({});
      if (result.success) {
        toast.success(`Test report sent to info@cafoli.in`);
      } else {
        toast.error(`Failed to send report: ${result.error}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send test report");
    } finally {
      setIsSendingReport(false);
    }
  };

  const handleDownloadCSV = async () => {
    if (!allLeadsForExport || allLeadsForExport.length === 0) {
      toast.error("No leads to export");
      return;
    }

    if (!nextDownloadNumber || !currentUser) {
      toast.error("Unable to generate download");
      return;
    }

    try {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const dateStr = `${day}-${month}-${year}`;

      const downloadNo = nextDownloadNumber;
      const csvFilename = `${downloadNo}_${dateStr}-all-cafoli-leads.csv`;
      const zipFilename = `${downloadNo}_${dateStr}-all-cafoli-leads.zip`;

      const headers = [
        'Name', 'Subject', 'Source', 'Mobile', 'Alt Mobile', 'Email', 'Alt Email',
        'Agency Name', 'Pincode', 'State', 'District', 'Station', 'Message',
        'Status', 'Type', 'Assigned To', 'Next Follow Up Date', 'Last Activity',
        'Pharmavends UID', 'IndiaMART Unique ID', 'Created At'
      ];

      const rows = allLeadsForExport.map(lead => [
        lead.name || '',
        lead.subject || '',
        lead.source || '',
        lead.mobile || '',
        lead.altMobile || '',
        lead.email || '',
        lead.altEmail || '',
        lead.agencyName || '',
        lead.pincode || '',
        lead.state || '',
        lead.district || '',
        lead.station || '',
        lead.message || '',
        lead.status || '',
        lead.type || '',
        lead.assignedToName || '',
        lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate).toLocaleString() : '',
        new Date(lead.lastActivity).toLocaleString(),
        lead.pharmavendsUid || '',
        lead.indiamartUniqueId || '',
        new Date(lead._creationTime).toLocaleString()
      ]);

      const escapeCsvValue = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      const csvContent = [
        headers.map(escapeCsvValue).join(','),
        ...rows.map(row => row.map(cell => escapeCsvValue(String(cell))).join(','))
      ].join('\n');

      const zip = new JSZip();
      zip.file(csvFilename, csvContent);

      const zipBlob = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 9 }
      });

      const link = document.createElement('a');
      const url = URL.createObjectURL(zipBlob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', zipFilename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await logExport({
        userId: currentUser._id,
        downloadNumber: downloadNo,
        fileName: zipFilename,
        leadCount: allLeadsForExport.length,
      });

      toast.success(`Downloaded ${allLeadsForExport.length} leads as ${zipFilename}`);
    } catch (error) {
      console.error('CSV download error:', error);
      toast.error('Failed to download CSV');
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Name", "Email", "Alt_Email", "Phone No", "Alt Phone No", 
      "Source", "Assigned To", "Agency Name", "Pincode", 
      "Station", "State", "District", "Subject", "Message"
    ];
    const csvContent = headers.join(",");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "leads_import_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (file: File) => {
    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    setIsImporting(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        try {
          const parsedLeads: any[] = [];
          
          for (const row of results.data as any[]) {
            if (!row["Name"] && !row["Phone No"]) continue;

            parsedLeads.push({
              name: row["Name"] || "Unknown",
              email: row["Email"] || undefined,
              altEmail: row["Alt_Email"] || undefined,
              mobile: row["Phone No"] || "",
              altMobile: row["Alt Phone No"] || undefined,
              source: row["Source"] || undefined,
              assignedToName: row["Assigned To"] || undefined,
              agencyName: row["Agency Name"] || undefined,
              pincode: row["Pincode"] || undefined,
              station: row["Station"] || undefined,
              state: row["State"] || undefined,
              district: row["District"] || undefined,
              subject: row["Subject"] || undefined,
              message: row["Message"] || undefined,
            });
          }

          if (parsedLeads.length === 0) {
            toast.error("No valid leads found in CSV");
            setIsImporting(false);
            return;
          }

          const result = await importLeads({
            leads: parsedLeads,
            adminId: currentUser._id,
          });

          toast.success(`Successfully imported ${result.importedCount} leads`);
        } catch (error) {
          console.error("Import error:", error);
          toast.error("Failed to import leads. Check console for details.");
        } finally {
          setIsImporting(false);
        }
      },
      error: (error: any) => {
        console.error("CSV Parse error:", error);
        toast.error("Failed to parse CSV file");
        setIsImporting(false);
      }
    });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        </div>

        <Tabs defaultValue="users" className="w-full">
          <TabsList>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="test">Test Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6 space-y-6">
            <div className="flex justify-end">
              <CreateUserDialog onCreateUser={handleCreateUser} />
            </div>
            <UserManagement 
              users={allUsers}
              currentUserId={currentUser?._id}
              onDeleteUser={handleDeleteUser}
              onLoginAs={handleLoginAs}
            />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {currentUser && <BrevoKeyManager userId={currentUser._id} />}
              {currentUser && <GeminiKeyManager userId={currentUser._id} />}
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Other Integrations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-medium">WhatsApp Business API</h3>
                      <p className="text-sm text-muted-foreground">Connected via Meta Cloud API</p>
                    </div>
                    <Button variant="outline" onClick={() => window.open("https://developers.facebook.com/apps", "_blank")}>
                      Manage in Meta
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="mt-6 space-y-6">
            <div className="grid gap-6">
              <ProductUploadDialog />
              <ProductListManager />
            </div>
          </TabsContent>

          <TabsContent value="system" className="mt-6">
            <AdminActions 
              onImportCSV={handleImportCSV}
              onDownloadTemplate={handleDownloadTemplate}
              onStandardizePhoneNumbers={handleStandardizePhoneNumbers}
              onMarkColdCallerLeads={handleManualMarkColdCallerLeads}
              onSendWelcomeToRecentLeads={handleSendWelcomeToRecentLeads}
              onAllocateColdCallerLeads={handleAllocateColdCallerLeads}
              onAutoAssignLeads={handleAutoAssignLeads}
              onSyncPharmavends={handleSyncPharmavends}
              onDownloadCSV={handleDownloadCSV}
              isStandardizing={isStandardizing}
              isImporting={isImporting}
              isMarkingColdCaller={isMarkingColdCaller}
              isSendingWelcome={isSendingWelcome}
              isAllocatingColdCaller={isAllocatingColdCaller}
              isAutoAssigning={isAutoAssigning}
              isSyncingPharmavends={isSyncingPharmavends}
              unallocatedColdCallerCount={unallocatedColdCallerCount}
            />
          </TabsContent>
          
          <TabsContent value="test" className="mt-6">
             <Card>
               <CardHeader>
                 <CardTitle>Test Report Generation</CardTitle>
               </CardHeader>
               <CardContent>
                 <Button onClick={handleSendTestReport} disabled={isSendingReport}>
                   {isSendingReport ? "Sending..." : "Generate Test Report"}
                 </Button>
               </CardContent>
             </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}