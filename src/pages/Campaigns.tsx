import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { Plus, Play, Pause, Trash2, Edit, BarChart } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

export default function Campaigns() {
  const { user } = useAuth();
  const campaigns = useQuery(api.campaigns.getCampaigns) || [];
  const navigate = useNavigate();

  const activateCampaign = useMutation(api.campaigns.activateCampaign);
  const pauseCampaign = useMutation(api.campaigns.pauseCampaign);
  const deleteCampaign = useMutation(api.campaigns.deleteCampaign);

  const handleActivate = async (campaignId: Id<"campaigns">) => {
    try {
      const result = await activateCampaign({ campaignId });
      toast.success(`Campaign activated! ${result.enrolled} leads enrolled.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to activate campaign");
    }
  };

  const handlePause = async (campaignId: Id<"campaigns">) => {
    try {
      await pauseCampaign({ campaignId });
      toast.success("Campaign paused");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to pause campaign");
    }
  };

  const handleDelete = async (campaignId: Id<"campaigns">) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;
    try {
      await deleteCampaign({ campaignId });
      toast.success("Campaign deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete campaign");
    }
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Create automated sequences for your leads.</p>
        </div>
        <Button onClick={() => navigate("/campaigns/new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <Card key={campaign._id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">{campaign.name}</CardTitle>
              <div className={`text-xs px-2 py-1 rounded-full ${
                campaign.status === 'active' ? 'bg-green-100 text-green-700' :
                campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {campaign.status}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {campaign.description && (
                  <p className="text-sm text-muted-foreground">{campaign.description}</p>
                )}
                
                <div className="text-xs text-muted-foreground">
                  {campaign.blocks.length} blocks
                </div>
                
                {campaign.metrics && (
                  <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
                    <div>
                      <div className="text-lg font-bold">{campaign.metrics.enrolled}</div>
                      <div className="text-xs text-muted-foreground">Enrolled</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{campaign.metrics.active}</div>
                      <div className="text-xs text-muted-foreground">Active</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold">{campaign.metrics.completed}</div>
                      <div className="text-xs text-muted-foreground">Completed</div>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2">
                  {campaign.status === 'draft' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => navigate(`/campaigns/edit/${campaign._id}`)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleActivate(campaign._id)}
                      >
                        <Play className="mr-1 h-3 w-3" />
                        Activate
                      </Button>
                    </>
                  )}
                  
                  {campaign.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handlePause(campaign._id)}
                    >
                      <Pause className="mr-1 h-3 w-3" />
                      Pause
                    </Button>
                  )}
                  
                  {campaign.status === 'paused' && (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleActivate(campaign._id)}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Resume
                    </Button>
                  )}
                  
                  {campaign.status !== 'active' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(campaign._id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {campaigns.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
            <BarChart className="h-12 w-12 mb-4 opacity-20" />
            <p>No campaigns created yet.</p>
            <Button className="mt-4" onClick={() => navigate("/campaigns/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Campaign
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}