import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Users,
  UserSquare2,
  Menu,
  X,
  PieChart,
  Download,
  Mail
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import JSZip from "jszip";
import { toast } from "sonner";
import { LeadReminders } from "./LeadReminders";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const ensureRole = useMutation(api.users.ensureRole);
  
  useEffect(() => {
    if (user && !user.role) {
      ensureRole({ userId: user._id });
    }
  }, [user, ensureRole]);

  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Unassigned Leads", href: "/leads", icon: Users },
    ...(isAdmin ? [{ name: "All Leads", href: "/all_leads", icon: Users }] : []),
    { name: "My Leads", href: "/my_leads", icon: UserSquare2 },
    { name: "WhatsApp", href: "/whatsapp", icon: MessageSquare },
    { name: "Emailing", href: "/emailing", icon: Mail },
    { name: "Campaigns", href: "/campaigns", icon: BarChart3 },
    { name: "Reports", href: "/reports", icon: PieChart },
    ...(isAdmin ? [{ name: "Admin", href: "/admin", icon: Settings }] : []),
  ];

  // Export Logic
  const [isExporting, setIsExporting] = useState(false);
  const allLeadsForExport = useQuery(api.leads.getAllLeadsForExport, isExporting && user ? { userId: user._id } : "skip");
  const nextDownloadNumber = useQuery(api.leads.getNextDownloadNumber);
  const logExport = useMutation(api.leads.logExport);

  useEffect(() => {
    const performExport = async () => {
      if (isExporting && allLeadsForExport && nextDownloadNumber && user) {
        try {
          const now = new Date();
          const day = String(now.getDate()).padStart(2, '0');
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const year = now.getFullYear();
          const dateStr = `${day}-${month}-${year}`;

          const downloadNo = nextDownloadNumber;
          const csvFilename = `${downloadNo}_${dateStr}-all-cafoli-leads.csv`;
          const zipFilename = `${downloadNo}_${dateStr}-all-cafoli-leads.zip`;

          const headers = [
            'Name', 'Subject', 'Source', 'Mobile', 'Alt Mobile', 'Email', 'Alt Email',
            'Agency Name', 'Pincode', 'State', 'District', 'Station', 'Message',
            'Status', 'Type', 'Assigned To', 'Next Follow Up Date', 'Last Activity',
            'Pharmavends UID', 'IndiaMART Unique ID', 'Created At'
          ];

          const rows = allLeadsForExport.map((lead: any) => [
            lead.name || '',
            lead.subject || '',
            lead.source || '',
            lead.mobile || '',
            lead.altMobile || '',
            lead.email || '',
            lead.altEmail || '',
            lead.agencyName || '',
            lead.pincode || '',
            lead.state || '',
            lead.district || '',
            lead.station || '',
            lead.message || '',
            lead.status || '',
            lead.type || '',
            lead.assignedToName || '',
            lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate).toLocaleString() : '',
            new Date(lead.lastActivity).toLocaleString(),
            lead.pharmavendsUid || '',
            lead.indiamartUniqueId || '',
            new Date(lead._creationTime).toLocaleString()
          ]);

          const escapeCsvValue = (value: string) => {
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          };

          const csvContent = [
            headers.map(escapeCsvValue).join(','),
            ...rows.map(row => row.map((cell: any) => escapeCsvValue(String(cell))).join(','))
          ].join('\n');

          const zip = new JSZip();
          zip.file(csvFilename, csvContent);

          const zipBlob = await zip.generateAsync({ 
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 9 }
          });

          const link = document.createElement('a');
          const url = URL.createObjectURL(zipBlob);
          
          link.setAttribute('href', url);
          link.setAttribute('download', zipFilename);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          await logExport({
            userId: user._id,
            downloadNumber: downloadNo,
            fileName: zipFilename,
            leadCount: allLeadsForExport.length,
          });

          toast.success(`Downloaded ${allLeadsForExport.length} leads`);
        } catch (error) {
          console.error('Export error:', error);
          toast.error('Failed to download leads');
        } finally {
          setIsExporting(false);
        }
      }
    };

    performExport();
  }, [isExporting, allLeadsForExport, nextDownloadNumber, logExport, user]);

  const handleExportClick = () => {
    if (!isAdmin) return;
    setIsExporting(true);
    toast.info("Preparing download...");
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      <div className="p-6">
        <div className="flex items-center gap-2 font-bold text-xl text-sidebar-primary">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
            C
          </div>
          Cafoli CRM
        </div>
      </div>
      
      <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border">
        {isAdmin && (
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2 mb-4"
            onClick={handleExportClick}
            disabled={isExporting}
          >
            <Download className={`h-4 w-4 ${isExporting ? 'animate-spin' : ''}`} />
            {isExporting ? "Exporting..." : "Download All Leads"}
          </Button>
        )}

        <div className="flex items-center gap-3 mb-4 px-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.image} />
            <AvatarFallback>{user?.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={async () => {
            await signOut();
            window.location.href = "/";
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <LeadReminders />
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 fixed inset-y-0 z-50">
        {renderSidebarContent()}
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b bg-background z-40 flex items-center px-4 justify-between">
        <div className="font-bold text-lg">Cafoli CRM</div>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            {renderSidebarContent()}
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <div className="flex-1 md:pl-64 pt-16 md:pt-0">
        <main className="p-4 sm:p-6 w-full">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}