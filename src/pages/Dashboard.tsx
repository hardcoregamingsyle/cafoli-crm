import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Users, MessageSquare, BarChart3, Activity } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { ColdCallerPopup } from "@/components/ColdCallerPopup";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function Dashboard() {
  const { user } = useAuth();
  const leads = useQuery(api.leads.getLeads, user ? { filter: "all", userId: user._id } : "skip") || [];
  const campaigns = useQuery(api.campaigns.getCampaigns, user ? { userId: user._id } : "skip") || [];
  
  // Cold Caller Leads
  const coldCallerLeadsNeedingFollowUp = useQuery(
    api.coldCallerLeads.getColdCallerLeadsNeedingFollowUp,
    user ? {} : "skip"
  ) || [];
  
  const overdueColdCallerLeads = useQuery(
    api.coldCallerLeads.getOverdueColdCallerLeads,
    user?.role === "admin" ? {} : "skip"
  ) || [];

  const [isColdCallerPopupOpen, setIsColdCallerPopupOpen] = useState(false);
  const [isAdminOverduePopupOpen, setIsAdminOverduePopupOpen] = useState(false);
  const [hasShownColdCallerPopup, setHasShownColdCallerPopup] = useState(false);
  const [hasShownAdminOverduePopup, setHasShownAdminOverduePopup] = useState(false);

  // Show Cold Caller popup for staff
  useEffect(() => {
    if (user?.role === "staff" && coldCallerLeadsNeedingFollowUp.length > 0 && !hasShownColdCallerPopup) {
      setIsColdCallerPopupOpen(true);
      setHasShownColdCallerPopup(true);
    }
  }, [user, coldCallerLeadsNeedingFollowUp, hasShownColdCallerPopup]);

  // Show overdue popup for admin
  useEffect(() => {
    if (user?.role === "admin" && overdueColdCallerLeads.length > 0 && !hasShownAdminOverduePopup) {
      setIsAdminOverduePopupOpen(true);
      setHasShownAdminOverduePopup(true);
    }
  }, [user, overdueColdCallerLeads, hasShownAdminOverduePopup]);

  // Memoize computed stats to avoid recalculation on every render
  const stats = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 86400000;
    
    return [
      {
        title: "Total Leads",
        value: leads.length,
        icon: Users,
        description: "All leads in system",
      },
      {
        title: "Active Campaigns",
        value: campaigns.filter((c: any) => c.status === "Active").length,
        icon: BarChart3,
        description: "Currently running",
      },
      {
        title: "New Leads Today",
        value: leads.filter((l: any) => l._creationTime > oneDayAgo).length,
        icon: Activity,
        description: "Last 24 hours",
      },
      {
        title: "Pending Follow-ups",
        value: leads.filter((l: any) => l.nextFollowUpDate && l.nextFollowUpDate < now).length,
        icon: MessageSquare,
        description: "Needs attention",
      },
    ];
  }, [leads, campaigns]);

  // Memoize recent leads slice
  const recentLeads = useMemo(() => leads.slice(0, 5), [leads]);
  const recentCampaigns = useMemo(() => campaigns.slice(0, 5), [campaigns]);

  return (
    <AppLayout>
      {/* Cold Caller Popup for Staff */}
      {user && coldCallerLeadsNeedingFollowUp.length > 0 && (
        <ColdCallerPopup
          leads={coldCallerLeadsNeedingFollowUp}
          isOpen={isColdCallerPopupOpen}
          onClose={() => setIsColdCallerPopupOpen(false)}
          userId={user._id}
        />
      )}

      {/* Admin Overdue Notification */}
      <Dialog open={isAdminOverduePopupOpen} onOpenChange={setIsAdminOverduePopupOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              ⚠️ Cold Caller Leads - Overdue Follow-ups ({overdueColdCallerLeads.length})
            </DialogTitle>
            <DialogDescription>
              The following Cold Caller Leads have follow-ups overdue by 3+ days. Please take action.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {overdueColdCallerLeads.map((lead: any) => (
              <div 
                key={lead._id} 
                className="p-3 border border-red-200 bg-red-50 rounded-lg"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-red-900">{lead.name}</h4>
                    <p className="text-sm text-red-700">{lead.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Assigned to: {lead.coldCallerAssignedToName || "Unknown"}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-red-600">
                      {lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate).toLocaleString() : "Unknown"}
                    </div>
                    <div className="text-xs text-red-500">
                      {Math.floor((Date.now() - (lead.nextFollowUpDate || 0)) / (24 * 60 * 60 * 1000))} days overdue
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your CRM performance.</p>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
          <Card className="col-span-1 lg:col-span-4">
            <CardHeader>
              <CardTitle>Recent Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentLeads.map((lead: any) => (
                  <div key={lead._id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="font-medium">{lead.name}</p>
                      <p className="text-sm text-muted-foreground">{lead.subject}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(lead._creationTime).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {leads.length === 0 && (
                  <p className="text-muted-foreground text-sm">No leads found.</p>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card className="col-span-1 lg:col-span-3">
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentCampaigns.map((campaign: any) => (
                  <div key={campaign._id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">{campaign.type}</p>
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full ${
                      campaign.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {campaign.status}
                    </div>
                  </div>
                ))}
                {campaigns.length === 0 && (
                  <p className="text-muted-foreground text-sm">No campaigns found.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}