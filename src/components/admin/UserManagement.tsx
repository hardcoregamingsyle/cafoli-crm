import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, LogIn, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

interface User {
  _id: Id<"users">;
  email?: string;
  name?: string;
  role?: "admin" | "staff";
  passwordHash?: string;
}

interface UserManagementProps {
  users: User[];
  currentUserId?: Id<"users">;
  onDeleteUser: (userId: Id<"users">) => Promise<void>;
  onLoginAs: (email: string) => Promise<void>;
}

export default function UserManagement({ users, currentUserId, onDeleteUser, onLoginAs }: UserManagementProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          User Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user._id}
              className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors gap-4 md:gap-0"
            >
              <div className="flex-1 w-full">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="font-medium">{user.name || "Unnamed User"}</p>
                    <p className="text-sm text-muted-foreground break-all">{user.email}</p>
                  </div>
                  {user.role && (
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {user.role}
                    </span>
                  )}
                  {user._id === currentUserId && (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                      You
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2 w-full md:w-auto justify-end">
                {user._id !== currentUserId && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onLoginAs(user.email || "")}
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
                            onClick={() => onDeleteUser(user._id)}
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
          
          {users.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No users found. Create your first user to get started.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}