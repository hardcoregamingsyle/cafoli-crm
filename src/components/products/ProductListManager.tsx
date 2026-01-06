import { useQuery, useMutation } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";

const api = getConvexApi() as any;
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Trash2, ExternalLink, Package, FileText, Image as ImageIcon } from "lucide-react";
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

export function ProductListManager() {
  const products = useQuery(api.products.listProducts) || [];
  const deleteProduct = useMutation(api.products.deleteProduct);

  const handleDelete = async (productId: any) => {
    try {
      await deleteProduct({ id: productId });
      toast.success("Product deleted successfully");
    } catch (error) {
      toast.error("Failed to delete product");
      console.error(error);
    }
  };

  return (
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
                          <Badge variant="outline" className="gap-1">
                            <ImageIcon className="h-3 w-3" /> Main Image
                          </Badge>
                        )}
                        {product.flyer && (
                          <Badge variant="outline" className="gap-1">
                            <ImageIcon className="h-3 w-3" /> Flyer
                          </Badge>
                        )}
                        {product.bridgeCard && (
                          <Badge variant="outline" className="gap-1">
                            <ImageIcon className="h-3 w-3" /> Bridge Card
                          </Badge>
                        )}
                        {product.visuelet && (
                          <Badge variant="outline" className="gap-1">
                            <FileText className="h-3 w-3" /> Visuelet
                          </Badge>
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
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}