import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Plus, Send, BarChart } from "lucide-react";

export default function Campaigns() {
  const campaigns = useQuery(api.campaigns.getCampaigns) || [];

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Manage your marketing campaigns.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <Card key={campaign._id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">{campaign.name}</CardTitle>
              <div className={`text-xs px-2 py-1 rounded-full ${
                campaign.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {campaign.status}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Send className="mr-2 h-4 w-4" />
                  {campaign.type}
                </div>
                
                {campaign.metrics && (
                  <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
                    <div>
                      <div className="text-lg font-bold">{campaign.metrics.sent}</div>
                      <div className="text-xs text-muted-foreground">Sent</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{campaign.metrics.opened}</div>
                      <div className="text-xs text-muted-foreground">Opened</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{campaign.metrics.clicked}</div>
                      <div className="text-xs text-muted-foreground">Clicked</div>
                    </div>
                  </div>
                )}
                
                <Button variant="outline" className="w-full mt-2">
                  <BarChart className="mr-2 h-4 w-4" />
                  View Report
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {campaigns.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
            <BarChart className="h-12 w-12 mb-4 opacity-20" />
            <p>No campaigns created yet.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
