import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Shield, Users, UserPlus, Trash2, LogIn, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import type { Id } from "@/convex/_generated/dataModel";

export default function Admin() {
  const { user: currentUser, signIn } = useAuth();
  const allUsers = useQuery(api.users.getAllUsers, currentUser ? { userId: currentUser._id } : "skip") || [];
  const allLeadsForExport = useQuery(api.leads.getAllLeadsForExport, currentUser ? { userId: currentUser._id } : "skip");
  const createUser = useMutation(api.users.createUser);
  const deleteUser = useMutation(api.users.deleteUser);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: "",
    name: "",
    password: "",
    role: "staff" as "admin" | "staff",
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUserData.email || !newUserData.name || !newUserData.password) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!currentUser) {
      toast.error("You must be logged in");
      return;
    }

    try {
      await createUser({
        email: newUserData.email,
        name: newUserData.name,
        password: newUserData.password,
        role: newUserData.role,
        adminId: currentUser._id,
      });
      
      toast.success("User created successfully");
      setIsCreateOpen(false);
      setNewUserData({ email: "", name: "", password: "", role: "staff" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create user");
    }
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
      // For simplicity, we'll use the email as both username and password
      // In production, you'd want a more secure approach
      const formData = new FormData();
      formData.append("email", email.toLowerCase());
      formData.append("password", email); // Using email as password for demo
      formData.append("flow", "signIn");
      
      await signIn("password", formData);
      toast.success(`Logged in as ${email}`);
    } catch (error) {
      toast.error("Failed to log in as user. Please use their actual credentials.");
    }
  };

  const handleDownloadCSV = () => {
    if (!allLeadsForExport || allLeadsForExport.length === 0) {
      toast.error("No leads to export");
      return;
    }

    try {
      // Get current date in dd-mm-yyyy format
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const dateStr = `${day}-${month}-${year}`;

      // Get download number (could be stored in localStorage or database)
      const downloadNo = parseInt(localStorage.getItem('cafoli_csv_download_count') || '0') + 1;
      localStorage.setItem('cafoli_csv_download_count', downloadNo.toString());

      const filename = `${downloadNo}_${dateStr}-all-cafoli-leads.csv`;

      // Define CSV headers
      const headers = [
        'Name', 'Subject', 'Source', 'Mobile', 'Alt Mobile', 'Email', 'Alt Email',
        'Agency Name', 'Pincode', 'State', 'District', 'Station', 'Message',
        'Status', 'Type', 'Assigned To', 'Next Follow Up Date', 'Last Activity',
        'Pharmavends UID', 'IndiaMART Unique ID', 'Created At'
      ];

      // Convert leads to CSV rows
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

      // Escape CSV values
      const escapeCsvValue = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      };

      // Build CSV content
      const csvContent = [
        headers.map(escapeCsvValue).join(','),
        ...rows.map(row => row.map(cell => escapeCsvValue(String(cell))).join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Downloaded ${allLeadsForExport.length} leads as ${filename}`);
    } catch (error) {
      console.error('CSV download error:', error);
      toast.error('Failed to download CSV');
    }
  };

  if (currentUser?.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">
                  You need admin privileges to access this page.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
            <p className="text-muted-foreground">Manage users and system settings.</p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadCSV}>
              <Download className="mr-2 h-4 w-4" />
              Download All Leads CSV
            </Button>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Username/Email</Label>
                    <Input
                      id="email"
                      type="text"
                      placeholder="username"
                      value={newUserData.email}
                      onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      value={newUserData.name}
                      onChange={(e) => setNewUserData({ ...newUserData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter password"
                      value={newUserData.password}
                      onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={newUserData.role}
                      onValueChange={(value: "admin" | "staff") => setNewUserData({ ...newUserData, role: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Create User</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allUsers.map((user: any) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{user.name || "Unnamed User"}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          user.role === "admin"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {user.role}
                      </span>
                      {user._id === currentUser?._id && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {user._id !== currentUser?._id && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoginAs(user.email || "")}
                        >
                          <LogIn className="h-4 w-4 mr-1" />
                          Login As
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              disabled={user.email?.toLowerCase() === "owner"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {user.name || user.email}? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(user._id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              ))}
              
              {allUsers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No users found. Create your first user to get started.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              System Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Configure integrations and system-wide preferences.
            </p>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 border rounded">
                <span className="text-sm font-medium">Pharmavends API</span>
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Pending</span>
              </div>
              <div className="flex justify-between items-center p-2 border rounded">
                <span className="text-sm font-medium">IndiaMART API</span>
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Pending</span>
              </div>
              <div className="flex justify-between items-center p-2 border rounded">
                <span className="text-sm font-medium">WhatsApp API</span>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Configured</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}