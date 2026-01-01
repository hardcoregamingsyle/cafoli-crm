import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "convex/react";
import { Users, MessageSquare, BarChart3, Activity } from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";

export default function Dashboard() {
  const { user } = useAuth();
  
  const leads = useQuery(api.leadQueries.getLeads, user ? { filter: "all", userId: user._id } : "skip") || [];
  const campaigns = useQuery(api.campaignQueries.getCampaigns, user ? { userId: user._id } : "skip") || [];
  
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