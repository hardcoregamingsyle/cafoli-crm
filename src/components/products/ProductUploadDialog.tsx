import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import { Loader2, Plus, Upload, X } from "lucide-react";

interface ProductUploadDialogProps {
  disabled?: boolean;
}

export function ProductUploadDialog({ disabled }: ProductUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [molecule, setMolecule] = useState("");
  const [mrp, setMrp] = useState("");
  const [packaging, setPackaging] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  
  const generateUploadUrl = useMutation(api.products.generateUploadUrl);
  const createProduct = useMutation(api.products.createProduct);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      if (files.length + selectedFiles.length > 4) {
        toast.error("You can only upload up to 4 images");
        return;
      }
      setSelectedFiles([...selectedFiles, ...files]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !brandName || !mrp || !packaging) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      // Upload images
      const imageStorageIds = [];
      for (const file of selectedFiles) {
        const postUrl = await generateUploadUrl();
        const result = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await result.json();
        imageStorageIds.push(storageId);
      }

      await createProduct({
        name,
        brandName,
        molecule,
        mrp,
        packaging,
        images: imageStorageIds,
        description,
      });

      toast.success("Product uploaded successfully");
      setOpen(false);
      // Reset form
      setName("");
      setBrandName("");
      setMolecule("");
      setMrp("");
      setPackaging("");
      setDescription("");
      setSelectedFiles([]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2"
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
          Upload Product
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload New Product</DialogTitle>
          <DialogDescription>
            Add a new product to the catalog. Up to 4 images allowed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Brand Name *</Label>
              <Input id="brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} required />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="molecule">Molecule / Composition</Label>
            <Input id="molecule" value={molecule} onChange={(e) => setMolecule(e.target.value)} placeholder="e.g. Paracetamol 500mg" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mrp">MRP *</Label>
              <Input id="mrp" value={mrp} onChange={(e) => setMrp(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="packaging">Packaging *</Label>
              <Input id="packaging" value={packaging} onChange={(e) => setPackaging(e.target.value)} required placeholder="e.g. 10x10 Strips" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Images (Max 4)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedFiles.map((file, i) => (
                <div key={i} className="relative bg-muted p-2 rounded-md flex items-center gap-2">
                  <span className="text-xs truncate max-w-[100px]">{file.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-destructive hover:text-destructive/80">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="image-upload"
                disabled={selectedFiles.length >= 4}
              />
              <Label
                htmlFor="image-upload"
                className={`flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted ${selectedFiles.length >= 4 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Upload className="h-4 w-4" />
                Select Images
              </Label>
              <span className="text-xs text-muted-foreground">
                {selectedFiles.length}/4 selected
              </span>
            </div>
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