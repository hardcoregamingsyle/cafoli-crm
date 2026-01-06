import AppLayout from "@/components/AppLayout";
import { ProductListManager } from "@/components/products/ProductListManager";
import { ProductUploadDialog } from "@/components/products/ProductUploadDialog";
import { RangePdfListManager } from "@/components/products/RangePdfListManager";
import { RangePdfUploadDialog } from "@/components/products/RangePdfUploadDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Catalog() {
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
            <div className="flex justify-end">
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