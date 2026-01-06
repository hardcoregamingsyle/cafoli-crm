import { useState } from "react";
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
import { Loader2, Plus, Upload, X, FileText, Image as ImageIcon } from "lucide-react";

interface ProductUploadDialogProps {
  disabled?: boolean;
}

export function ProductUploadDialog({ disabled }: ProductUploadDialogProps) {
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
  const [visuelet, setVisuelet] = useState<File | null>(null);
  
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const createProduct = useMutation(api.products.createProduct);

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>, 
    setter: (f: File | null) => void,
    accept: string
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic validation
      if (accept === "application/pdf" && file.type !== "application/pdf") {
        toast.error("Please upload a PDF file");
        return;
      }
      if (accept.startsWith("image/") && !file.type.startsWith("image/")) {
        toast.error("Please upload an image file");
        return;
      }
      setter(file);
    }
  };

  const uploadFile = async (file: File) => {
    const postUrl = await generateUploadUrl();
    const result = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
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

    if (!mainImage) {
      toast.error("Product Image is compulsory");
      return;
    }

    setLoading(true);
    try {
      // Upload files
      const mainImageId = await uploadFile(mainImage);
      
      let flyerId = undefined;
      if (flyer) flyerId = await uploadFile(flyer);
      
      let bridgeCardId = undefined;
      if (bridgeCard) bridgeCardId = await uploadFile(bridgeCard);
      
      let visueletId = undefined;
      if (visuelet) visueletId = await uploadFile(visuelet);

      await createProduct({
        brandName,
        molecule,
        mrp,
        packaging,
        mainImage: mainImageId,
        flyer: flyerId,
        bridgeCard: bridgeCardId,
        visuelet: visueletId,
        description,
        pageLink,
      });

      toast.success("Product uploaded successfully");
      setOpen(false);
      // Reset form
      setBrandName("");
      setMolecule("");
      setMrp("");
      setPackaging("");
      setDescription("");
      setPageLink("");
      setMainImage(null);
      setFlyer(null);
      setBridgeCard(null);
      setVisuelet(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload product");
    } finally {
      setLoading(false);
    }
  };

  const FileInput = ({ 
    label, 
    file, 
    setFile, 
    accept, 
    required = false 
  }: { 
    label: string, 
    file: File | null, 
    setFile: (f: File | null) => void, 
    accept: string,
    required?: boolean
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
        <Button 
          variant="outline" 
          className="gap-2"
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
          Upload Product
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload New Product</DialogTitle>
          <DialogDescription>
            Add a new product to the catalog.
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
              required 
            />
            <FileInput 
              label="Product Flyer" 
              file={flyer} 
              setFile={setFlyer} 
              accept="image/*" 
            />
            <FileInput 
              label="Bridge Card" 
              file={bridgeCard} 
              setFile={setBridgeCard} 
              accept="image/*" 
            />
            <FileInput 
              label="Visuelet (PDF)" 
              file={visuelet} 
              setFile={setVisuelet} 
              accept="application/pdf" 
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload Product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}