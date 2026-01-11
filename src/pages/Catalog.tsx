import AppLayout from "@/components/AppLayout";
import { ProductListManager } from "@/components/products/ProductListManager";
import { ProductUploadDialog } from "@/components/products/ProductUploadDialog";
import { RangePdfListManager } from "@/components/products/RangePdfListManager";
import { RangePdfUploadDialog } from "@/components/products/RangePdfUploadDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Catalog() {
  const deduplicateProducts = useMutation((api as any).products.deduplicateProducts);
  const [isDeduplicating, setIsDeduplicating] = useState(false);

  const handleDeduplicate = async () => {
    setIsDeduplicating(true);
    try {
      const count = await deduplicateProducts();
      toast.success(`Removed ${count} duplicate products`);
    } catch (error) {
      toast.error("Failed to deduplicate products");
      console.error(error);
    } finally {
      setIsDeduplicating(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Catalog Management</h1>
          <p className="text-muted-foreground">
            Manage products, division ranges, and therapeutic ranges.
          </p>
        </div>

        <Tabs defaultValue="products" className="space-y-4">
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="ranges">Range PDFs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="products" className="space-y-4">
            <div className="flex justify-end gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isDeduplicating}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeduplicating ? "Cleaning..." : "Deduplicate Products"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete all duplicate products (same name), keeping only the most recently created version. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeduplicate}>Continue</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <ProductUploadDialog />
            </div>
            <ProductListManager />
          </TabsContent>
          
          <TabsContent value="ranges" className="space-y-4">
            <div className="flex justify-end">
              <RangePdfUploadDialog />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Range PDFs</CardTitle>
                <CardDescription>Manage Division and Therapeutic range PDF catalogs.</CardDescription>
              </CardHeader>
              <CardContent>
                <RangePdfListManager />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}