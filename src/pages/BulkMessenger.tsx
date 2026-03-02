import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAction, useQuery } from "convex/react";
import { getConvexApi } from "@/lib/convex-api";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Upload, Send, FileText, AlertCircle, Users, CheckCircle2, XCircle } from "lucide-react";
import Papa from "papaparse";
import { Progress } from "@/components/ui/progress";

const api = getConvexApi() as any;

export default function BulkMessenger() {
  const { user } = useAuth();
  const [csvData, setCsvData] = useState<any[]>([]);
  const [mapping, setMapping] = useState({ phone: "", name: "" });
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ sent: number; failed: number; total: number; errors: any[] } | null>(null);

  const templates = useQuery(api.whatsappTemplatesQueries.getTemplates) || [];
  const sendBulk = useAction(api.whatsappBulk.sendBulkTemplateMessages);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data as any[]);
        setResults(null);
        toast.success(`Loaded ${results.data.length} contacts from CSV`);

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
    setResults(null);

    try {
      const contacts = csvData
        .map(row => ({
          phoneNumber: String(row[mapping.phone] || "").replace(/\D/g, ""),
          name: mapping.name ? String(row[mapping.name] || "") : undefined,
        }))
        .filter(c => c.phoneNumber.length >= 7);

      if (contacts.length === 0) {
        toast.error("No valid phone numbers found in the selected column");
        return;
      }

      const result = await sendBulk({
        contacts,
        templateName: selectedTemplate,
        adminId: user._id,
      });

      setResults(result);

      if (result.sent > 0) {
        toast.success(`Sent ${result.sent} of ${result.total} messages successfully`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} messages failed to send`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to send bulk messages");
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
          <p className="text-muted-foreground">Send WhatsApp template messages to non-lead contacts via CSV upload.</p>
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
                        <SelectItem value="none_selected">None</SelectItem>
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
              <CardDescription>Select a WhatsApp template and send to all contacts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>WhatsApp Template *</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 ? (
                      <SelectItem value="no_templates" disabled>No templates available</SelectItem>
                    ) : (
                      templates.map((t: any) => (
                        <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only approved WhatsApp templates can be used for bulk messaging.
                </p>
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

              {/* Results */}
              {results && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold">Send Results</h3>
                  <Progress value={(results.sent / results.total) * 100} className="h-2" />
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{results.sent} Sent</span>
                    </div>
                    <div className="flex items-center gap-2 text-destructive">
                      <XCircle className="h-4 w-4" />
                      <span>{results.failed} Failed</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{results.total} Total</span>
                    </div>
                  </div>
                  {results.errors.length > 0 && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">View errors ({results.errors.length})</summary>
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {results.errors.slice(0, 20).map((e, i) => (
                          <p key={i}>{e.phone}: {e.error}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <Button
                  size="lg"
                  className="gap-2"
                  disabled={isProcessing || !mapping.phone || !selectedTemplate || csvData.length === 0}
                  onClick={handleSendBulk}
                >
                  <Send className="h-4 w-4" />
                  {isProcessing ? "Sending..." : `Send to ${csvData.length} Contacts`}
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