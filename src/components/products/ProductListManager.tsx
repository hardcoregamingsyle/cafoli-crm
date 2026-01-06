import { useQuery, useMutation } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";

const api = getConvexApi() as any;
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Trash2, ExternalLink, Package, FileText, Image as ImageIcon, Edit, Eye } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProductUploadDialog } from "./ProductUploadDialog";
import { useState } from "react";

export function ProductListManager() {
  const products = useQuery(api.products.listProducts) || [];
  const deleteProduct = useMutation(api.products.deleteProduct);
  const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);

  const handleDelete = async (productId: any) => {
    try {
      await deleteProduct({ id: productId });
      toast.success("Product deleted successfully");
    } catch (error) {
      toast.error("Failed to delete product");
      console.error(error);
    }
  };

  const handlePreview = (storageId: string, type: string, name: string) => {
    // Construct proper Convex storage URL with correct content type handling
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    // Remove any trailing slash from convexUrl
    const baseUrl = convexUrl.endsWith('/') ? convexUrl.slice(0, -1) : convexUrl;
    const url = `${baseUrl}/api/storage/${storageId}`;
    setPreviewFile({ url, type, name });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Product Catalog
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-3">
              {products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No products uploaded yet</p>
                </div>
              ) : (
                products.map((product: any) => (
                  <Card key={product._id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{product.name}</h3>
                          {product.brandName && product.brandName !== product.name && (
                            <Badge variant="secondary">{product.brandName}</Badge>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                          {product.molecule && (
                            <div className="text-muted-foreground">
                              <span className="font-medium text-foreground">Molecule:</span> {product.molecule}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">MRP:</span> ₹{product.mrp}
                          </div>
                          <div>
                            <span className="font-medium">Packaging:</span> {product.packaging}
                          </div>
                        </div>

                        {product.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                            {product.description}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 mt-3">
                          {product.mainImage && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7"
                              onClick={() => handlePreview(product.mainImage, "image", "Main Image")}
                            >
                              <Eye className="h-3 w-3" />
                              <ImageIcon className="h-3 w-3" /> Main Image
                            </Button>
                          )}
                          {product.flyer && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7"
                              onClick={() => handlePreview(product.flyer, "image", "Flyer")}
                            >
                              <Eye className="h-3 w-3" />
                              <ImageIcon className="h-3 w-3" /> Flyer
                            </Button>
                          )}
                          {product.bridgeCard && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7"
                              onClick={() => handlePreview(product.bridgeCard, "image", "Bridge Card")}
                            >
                              <Eye className="h-3 w-3" />
                              <ImageIcon className="h-3 w-3" /> Bridge Card
                            </Button>
                          )}
                          {product.visuelet && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7"
                              onClick={() => handlePreview(product.visuelet, "pdf", "Visuelet")}
                            >
                              <Eye className="h-3 w-3" />
                              <FileText className="h-3 w-3" /> Visuelet
                            </Button>
                          )}
                          {product.pageLink && (
                            <a
                              href={product.pageLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1 ml-2"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Page
                            </a>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <ProductUploadDialog 
                          product={product}
                          trigger={
                            <Button variant="ghost" size="icon" className="text-primary hover:text-primary/80">
                              <Edit className="h-4 w-4" />
                            </Button>
                          }
                        />
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive/80"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Product</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{product.name}"? This will also remove all associated files. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(product._id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center gap-4">
            {previewFile?.type === "image" ? (
              <img 
                src={previewFile.url} 
                alt={previewFile.name}
                className="max-w-full max-h-[70vh] object-contain"
              />
            ) : (
              <iframe
                src={previewFile?.url}
                className="w-full h-[70vh] border rounded"
                title={previewFile?.name}
              />
            )}
            <Button asChild variant="outline">
              <a href={previewFile?.url} target="_blank" rel="noopener noreferrer" download>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}