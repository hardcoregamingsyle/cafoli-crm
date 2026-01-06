import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";

const api = getConvexApi() as any;
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Upload, X, FileText, Image as ImageIcon, Edit } from "lucide-react";

interface ProductUploadDialogProps {
  disabled?: boolean;
  product?: any; // If provided, we are in edit mode
  trigger?: React.ReactNode;
}

export function ProductUploadDialog({ disabled, product, trigger }: ProductUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [molecule, setMolecule] = useState("");
  const [mrp, setMrp] = useState("");
  const [packaging, setPackaging] = useState("");
  const [description, setDescription] = useState("");
  const [pageLink, setPageLink] = useState("");
  
  // Files
  const [mainImage, setMainImage] = useState<File | null>(null);
  const [flyer, setFlyer] = useState<File | null>(null);
  const [bridgeCard, setBridgeCard] = useState<File | null>(null);
  const [visualaid, setVisualaid] = useState<File | null>(null);

  // Existing file flags (for UI only, to show something is there)
  const [hasExistingMainImage, setHasExistingMainImage] = useState(false);
  const [hasExistingFlyer, setHasExistingFlyer] = useState(false);
  const [hasExistingBridgeCard, setHasExistingBridgeCard] = useState(false);
  const [hasExistingVisualaid, setHasExistingVisualaid] = useState(false);
  
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const createProduct = useMutation(api.products.createProduct);
  const updateProduct = useMutation(api.products.updateProduct);

  useEffect(() => {
    if (product && open) {
      setBrandName(product.brandName || "");
      setMolecule(product.molecule || "");
      setMrp(product.mrp || "");
      setPackaging(product.packaging || "");
      setDescription(product.description || "");
      setPageLink(product.pageLink || "");
      
      setHasExistingMainImage(!!product.mainImage);
      setHasExistingFlyer(!!product.flyer);
      setHasExistingBridgeCard(!!product.bridgeCard);
      setHasExistingVisualaid(!!product.visualaid);
    } else if (!product && open) {
      // Reset for create mode
      setBrandName("");
      setMolecule("");
      setMrp("");
      setPackaging("");
      setDescription("");
      setPageLink("");
      setMainImage(null);
      setFlyer(null);
      setBridgeCard(null);
      setVisualaid(null);
      setHasExistingMainImage(false);
      setHasExistingFlyer(false);
      setHasExistingBridgeCard(false);
      setHasExistingVisualaid(false);
    }
  }, [product, open]);

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>, 
    setter: (f: File | null) => void,
    accept: string
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      // Validate based on file extension as fallback
      if (accept === "application/pdf") {
        if (ext !== "pdf" && file.type !== "application/pdf") {
          toast.error("Please upload a PDF file");
          return;
        }
      }
      if (accept.startsWith("image/")) {
        const validImageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!validImageExts.includes(ext || '') && !file.type.startsWith("image/")) {
          toast.error("Please upload an image file (JPG, PNG, GIF, or WebP)");
          return;
        }
      }
      setter(file);
    }
  };

  const uploadFile = async (file: File) => {
    const postUrl = await generateUploadUrl();
    
    // Ensure correct Content-Type header
    let contentType = file.type;
    if (!contentType || contentType === 'application/octet-stream') {
      // Fallback based on file extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') contentType = 'application/pdf';
      else if (['jpg', 'jpeg'].includes(ext || '')) contentType = 'image/jpeg';
      else if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (ext === 'webp') contentType = 'image/webp';
    }
    
    const result = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: file,
    });
    const { storageId } = await result.json();
    return storageId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName || !mrp || !packaging) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!product && !mainImage) {
      toast.error("Product Image is compulsory for new products");
      return;
    }

    setLoading(true);
    try {
      // Upload files
      let mainImageId = undefined;
      if (mainImage) mainImageId = await uploadFile(mainImage);
      
      let flyerId = undefined;
      if (flyer) flyerId = await uploadFile(flyer);
      
      let bridgeCardId = undefined;
      if (bridgeCard) bridgeCardId = await uploadFile(bridgeCard);
      
      let visualaidId = undefined;
      if (visualaid) visualaidId = await uploadFile(visualaid);

      if (product) {
        await updateProduct({
          id: product._id,
          brandName,
          molecule,
          mrp,
          packaging,
          mainImage: mainImageId,
          flyer: flyerId,
          bridgeCard: bridgeCardId,
          visualaid: visualaidId,
          description,
          pageLink,
          // If user removed existing file (we need UI for this, but for now let's assume replacing or keeping)
          // To properly support removal, we need "remove" buttons for existing files.
          // For now, we only support replacing or adding.
          // If we want to support removal, we need state for "removeFlyer", etc.
          // Let's add simple removal logic if we have time, but for now replacing is key.
          // If we want to support removal, we need state for "removeFlyer", etc.
          // Let's add simple removal logic if we have time, but for now replacing is key.
          removeFlyer: hasExistingFlyer === false && !!product.flyer, // If it was there but now UI says no (we need to implement the UI removal)
          removeBridgeCard: hasExistingBridgeCard === false && !!product.bridgeCard,
          removeVisualaid: hasExistingVisualaid === false && !!product.visualaid,
        });
        toast.success("Product updated successfully");
      } else {
        await createProduct({
          brandName,
          molecule,
          mrp,
          packaging,
          mainImage: mainImageId!,
          flyer: flyerId,
          bridgeCard: bridgeCardId,
          visualaid: visualaidId,
          description,
          pageLink,
        });
        toast.success("Product uploaded successfully");
      }

      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(product ? "Failed to update product" : "Failed to upload product");
    } finally {
      setLoading(false);
    }
  };

  const FileInput = ({ 
    label, 
    file, 
    setFile, 
    accept, 
    required = false,
    existing = false,
    onRemoveExisting
  }: { 
    label: string, 
    file: File | null, 
    setFile: (f: File | null) => void, 
    accept: string,
    required?: boolean,
    existing?: boolean,
    onRemoveExisting?: () => void
  }) => (
    <div className="space-y-2">
      <Label>{label} {required && "*"}</Label>
      {file ? (
        <div className="relative bg-muted p-2 rounded-md flex items-center gap-2">
          {accept === "application/pdf" ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          <span className="text-xs truncate flex-1">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} className="text-destructive hover:text-destructive/80">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : existing ? (
        <div className="relative bg-muted/50 border border-dashed p-2 rounded-md flex items-center gap-2">
          {accept === "application/pdf" ? <FileText className="h-4 w-4 text-muted-foreground" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs truncate flex-1 text-muted-foreground">Existing file</span>
          {onRemoveExisting && (
             <button type="button" onClick={onRemoveExisting} className="text-destructive hover:text-destructive/80" title="Remove existing file">
               <X className="h-3 w-3" />
             </button>
          )}
          <div className="relative ml-2">
             <Input
                type="file"
                accept={accept}
                onChange={(e) => handleFileSelect(e, setFile, accept)}
                className="hidden"
                id={`file-replace-${label.replace(/\s+/g, '-')}`}
              />
              <Label
                htmlFor={`file-replace-${label.replace(/\s+/g, '-')}`}
                className="text-xs text-primary cursor-pointer hover:underline"
              >
                Replace
              </Label>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept={accept}
            onChange={(e) => handleFileSelect(e, setFile, accept)}
            className="hidden"
            id={`file-${label.replace(/\s+/g, '-')}`}
          />
          <Label
            htmlFor={`file-${label.replace(/\s+/g, '-')}`}
            className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted w-full justify-center text-sm"
          >
            <Upload className="h-3 w-3" />
            Select File
          </Label>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? trigger : (
          <Button 
            variant="outline" 
            className="gap-2"
            disabled={disabled}
          >
            <Plus className="h-4 w-4" />
            Upload Product
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Upload New Product"}</DialogTitle>
          <DialogDescription>
            {product ? "Update product details and files." : "Add a new product to the catalog."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brand">Brand Name *</Label>
              <Input id="brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="molecule">Molecule</Label>
              <Input id="molecule" value={molecule} onChange={(e) => setMolecule(e.target.value)} placeholder="e.g. Paracetamol" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mrp">MRP *</Label>
              <Input id="mrp" value={mrp} onChange={(e) => setMrp(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="packaging">Packaging *</Label>
              <Input id="packaging" value={packaging} onChange={(e) => setPackaging(e.target.value)} required placeholder="e.g. 10x10" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pageLink">Page Link (Optional)</Label>
            <Input 
              id="pageLink" 
              type="url"
              value={pageLink} 
              onChange={(e) => setPageLink(e.target.value)} 
              placeholder="https://example.com/product"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <FileInput 
              label="Product Image" 
              file={mainImage} 
              setFile={setMainImage} 
              accept="image/*" 
              required={!product}
              existing={hasExistingMainImage}
              // Main image cannot be removed, only replaced
            />
            <FileInput 
              label="Product Flyer" 
              file={flyer} 
              setFile={setFlyer} 
              accept="image/*" 
              existing={hasExistingFlyer}
              onRemoveExisting={() => setHasExistingFlyer(false)}
            />
            <FileInput 
              label="Bridge Card" 
              file={bridgeCard} 
              setFile={setBridgeCard} 
              accept="image/*" 
              existing={hasExistingBridgeCard}
              onRemoveExisting={() => setHasExistingBridgeCard(false)}
            />
            <FileInput 
              label="Visual Aid (PDF)" 
              file={visualaid} 
              setFile={setVisualaid} 
              accept="application/pdf" 
              existing={hasExistingVisualaid}
              onRemoveExisting={() => setHasExistingVisualaid(false)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {product ? "Update Product" : "Upload Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}