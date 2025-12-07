import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Users, MessageSquare, BarChart3, Activity } from "lucide-react";

export default function Dashboard() {
  const leads = useQuery(api.leads.getLeads, { filter: "all" }) || [];
  const campaigns = useQuery(api.campaigns.getCampaigns) || [];

  const stats = [
    {
      title: "Total Leads",
      value: leads.length,
      icon: Users,
      description: "All leads in system",
    },
    {
      title: "Active Campaigns",
      value: campaigns.filter(c => c.status === "Active").length,
      icon: BarChart3,
      description: "Currently running",
    },
    {
      title: "New Leads Today",
      value: leads.filter(l => l._creationTime > Date.now() - 86400000).length,
      icon: Activity,
      description: "Last 24 hours",
    },
    {
      title: "Pending Follow-ups",
      value: leads.filter(l => l.nextFollowUpDate && l.nextFollowUpDate < Date.now()).length,
      icon: MessageSquare,
      description: "Needs attention",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your CRM performance.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Recent Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {leads.slice(0, 5).map((lead) => (
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
          
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {campaigns.slice(0, 5).map((campaign) => (
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
