import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Key, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";

interface BrevoKeyManagerProps {
  userId: Id<"users">;
}

export default function BrevoKeyManager({ userId }: BrevoKeyManagerProps) {
  const brevoKeys = useQuery(api.brevoMutations.getBrevoApiKeys, { adminId: userId });
  const addKey = useMutation(api.brevoMutations.addBrevoApiKey);
  const updateKey = useMutation(api.brevoMutations.updateBrevoApiKey);
  const deleteKey = useMutation(api.brevoMutations.deleteBrevoApiKey);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState({
    apiKey: "",
    label: "",
    dailyLimit: "300",
  });

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newKeyData.apiKey) {
      toast.error("Please enter an API key");
      return;
    }

    try {
      await addKey({
        adminId: userId,
        apiKey: newKeyData.apiKey,
        label: newKeyData.label || undefined,
        dailyLimit: parseInt(newKeyData.dailyLimit) || 300,
      });
      
      toast.success("Brevo API key added successfully");
      setIsAddOpen(false);
      setNewKeyData({ apiKey: "", label: "", dailyLimit: "300" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add API key");
    }
  };

  const handleToggleActive = async (keyId: Id<"brevoApiKeys">, currentStatus: boolean) => {
    try {
      await updateKey({
        adminId: userId,
        keyId,
        isActive: !currentStatus,
      });
      toast.success(`API key ${!currentStatus ? "activated" : "deactivated"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update key");
    }
  };

  const handleDeleteKey = async (keyId: Id<"brevoApiKeys">) => {
    try {
      await deleteKey({ adminId: userId, keyId });
      toast.success("API key deleted successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete key");
    }
  };

  const formatUsage = (key: any) => {
    const limit = key.dailyLimit || 300;
    const usage = key.usageCount || 0;
    const percentage = Math.round((usage / limit) * 100);
    return { usage, limit, percentage };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Brevo Email API Keys
          </CardTitle>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Brevo API Key</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddKey} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key *</Label>
                  <Input
                    id="apiKey"
                    type="text"
                    placeholder="xkeysib-..."
                    value={newKeyData.apiKey}
                    onChange={(e) => setNewKeyData({ ...newKeyData, apiKey: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label (Optional)</Label>
                  <Input
                    id="label"
                    type="text"
                    placeholder="e.g., Key 1, Production Key"
                    value={newKeyData.label}
                    onChange={(e) => setNewKeyData({ ...newKeyData, label: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dailyLimit">Daily Limit</Label>
                  <Input
                    id="dailyLimit"
                    type="number"
                    placeholder="300"
                    value={newKeyData.dailyLimit}
                    onChange={(e) => setNewKeyData({ ...newKeyData, dailyLimit: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Free tier: 300 emails/day. Adjust based on your plan.
                  </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Add Key</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {!brevoKeys || brevoKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No Brevo API keys configured.</p>
            <p className="text-sm mt-2">Add keys to enable email sending in campaigns.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {brevoKeys.map((key: any, index: number) => {
              const { usage, limit, percentage } = formatUsage(key);
              const isNearLimit = percentage >= 80;
              const isAtLimit = percentage >= 100;

              return (
                <div
                  key={key._id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium">
                        {key.label || `Key ${index + 1}`}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          key.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {key.isActive ? "Active" : "Inactive"}
                      </span>
                      {isAtLimit && (
                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                          Limit Reached
                        </span>
                      )}
                      {isNearLimit && !isAtLimit && (
                        <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                          Near Limit
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {key.apiKey.substring(0, 20)}...
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Usage: {usage} / {limit} ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            isAtLimit
                              ? "bg-red-500"
                              : isNearLimit
                              ? "bg-yellow-500"
                              : "bg-green-500"
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(key._id, key.isActive)}
                    >
                      {key.isActive ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete API Key</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this Brevo API key? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteKey(key._id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>How it works:</strong> Keys are used in order. When Key 1 reaches its daily limit, 
            the system automatically switches to Key 2, and so on. Usage resets every 24 hours.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
