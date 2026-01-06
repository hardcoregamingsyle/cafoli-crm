import AppLayout from "@/components/AppLayout";
import BrevoKeyManager from "@/components/BrevoKeyManager";
import UserManagement from "@/components/admin/UserManagement";
import CreateUserDialog from "@/components/admin/CreateUserDialog";
import AdminActions from "@/components/admin/AdminActions";
import GeminiKeyManager from "@/components/GeminiKeyManager";
import { AllocateColdCallerDialog } from "@/components/admin/AllocateColdCallerDialog";
import { ProductUploadDialog } from "@/components/products/ProductUploadDialog";
import { ProductListManager } from "@/components/products/ProductListManager";
import { RangePdfUploadDialog } from "@/components/products/RangePdfUploadDialog";
import { RangePdfListManager } from "@/components/products/RangePdfListManager";
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
import { Table, TableHeader, TableRow, TableBody, TableCell, TableHead } from "@/components/ui/table";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

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
  
  const [activeTab, setActiveTab] = useState("users");

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

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          {currentUser.role === "admin" && <TabsTrigger value="users">User Management</TabsTrigger>}
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="ranges">Range PDFs</TabsTrigger>
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
                  {users?.map((user) => (
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
  );
}