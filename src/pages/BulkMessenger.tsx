import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Upload, Send, FileText, CheckCircle2, AlertCircle, Users } from "lucide-react";
import Papa from "papaparse";

const api = getConvexApi() as any;

export default function BulkMessenger() {
  const { user } = useAuth();
  const [csvData, setCsvData] = useState<any[]>([]);
  const [mapping, setMapping] = useState({ phone: "", name: "" });
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  const templates = useQuery(api.whatsappTemplatesQueries.getTemplates) || [];
  const trackSent = useMutation(api.bulkMessaging.trackSentMessages);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data);
        toast.success(`Loaded ${results.data.length} contacts from CSV`);
        
        // Try auto-mapping
        const headers = results.meta.fields || [];
        const phoneHeader = headers.find(h => /phone|mobile|number|tel/i.test(h));
        const nameHeader = headers.find(h => /name|contact|customer/i.test(h));
        
        setMapping({
          phone: phoneHeader || "",
          name: nameHeader || ""
        });
      }
    });
  };

  const handleSendBulk = async () => {
    if (!user || !selectedTemplate || csvData.length === 0 || !mapping.phone) {
      toast.error("Please fill all required fields and map the phone column");
      return;
    }

    setIsProcessing(true);
    const contactsToTrack: any[] = [];

    try {
      // In a real scenario, this would trigger an Action that talks to the Cloudflare Worker
      // For this implementation, we simulate the sending and track the data
      
      for (const row of csvData) {
        const phone = row[mapping.phone]?.replace(/\D/g, "");
        if (phone) {
          contactsToTrack.push({
            phoneNumber: phone,
            name: mapping.name ? row[mapping.name] : undefined,
            templateId: selectedTemplate,
            metadata: row
          });
        }
      }

      await trackSent({
        adminId: user._id,
        contacts: contactsToTrack
      });

      toast.success(`Bulk campaign started for ${contactsToTrack.length} contacts`);
      setCsvData([]);
      setSelectedTemplate("");
    } catch (error) {
      toast.error("Failed to start bulk campaign");
    } finally {
      setIsProcessing(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh]">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h1 className="text-2xl font-bold">Unauthorized</h1>
          <p className="text-muted-foreground">Only admins can access bulk messaging.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bulk Messenger</h1>
          <p className="text-muted-foreground">Send template messages to non-lead contacts via CSV upload.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Contacts
              </CardTitle>
              <CardDescription>Upload a CSV file containing contact numbers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="csv">CSV File</Label>
                <Input id="csv" type="file" accept=".csv" onChange={handleFileUpload} />
              </div>

              {csvData.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label>Map Phone Number Column *</Label>
                    <Select value={mapping.phone} onValueChange={(v) => setMapping({ ...mapping, phone: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(csvData[0]).map(header => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Map Name Column (Optional)</Label>
                    <Select value={mapping.name} onValueChange={(v) => setMapping({ ...mapping, name: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {Object.keys(csvData[0]).map(header => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Campaign Configuration
              </CardTitle>
              <CardDescription>Select template and preview your campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>WhatsApp Template *</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t: any) => (
                      <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Campaign Summary
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-background rounded border">
                    <p className="text-muted-foreground">Total Contacts</p>
                    <p className="text-2xl font-bold">{csvData.length}</p>
                  </div>
                  <div className="p-3 bg-background rounded border">
                    <p className="text-muted-foreground">Mapped Status</p>
                    <p className={mapping.phone ? "text-green-600 font-bold" : "text-destructive font-bold"}>
                      {mapping.phone ? "Ready" : "Phone Missing"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button 
                  size="lg" 
                  className="gap-2" 
                  disabled={isProcessing || !mapping.phone || !selectedTemplate}
                  onClick={handleSendBulk}
                >
                  <Send className="h-4 w-4" />
                  {isProcessing ? "Sending..." : "Send Bulk Messages"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {csvData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Data Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b">
                      {Object.keys(csvData[0]).map(header => (
                        <th key={header} className="text-left p-2 font-medium">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        {Object.values(row).map((val: any, j) => (
                          <td key={j} className="p-2">{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 5 && (
                  <p className="text-xs text-center mt-2 text-muted-foreground">Showing first 5 of {csvData.length} rows</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}