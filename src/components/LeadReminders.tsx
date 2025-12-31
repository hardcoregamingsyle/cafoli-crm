import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router";
import { format } from "date-fns";
import { AlertTriangle, TrendingUp } from "lucide-react";

export function LeadReminders() {
  const criticalLeads = useQuery(api.leadQueries.getCriticalOverdueLeads, {});
  const coldLeads = useQuery(api.leadQueries.getColdOverdueLeads, {});
  const navigate = useNavigate();

  const [showCritical, setShowCritical] = useState(false);
  const [showCold, setShowCold] = useState(false);

  useEffect(() => {
    if (criticalLeads && criticalLeads.length > 0) {
      setShowCritical(true);
    }
  }, [criticalLeads]);

  useEffect(() => {
    if (coldLeads && coldLeads.length > 0 && (!criticalLeads || criticalLeads.length === 0)) {
      // Only show cold leads if no critical leads are showing (priority)
      // Or we could show them sequentially. For now, let's prioritize critical.
      setShowCold(true);
    }
  }, [coldLeads, criticalLeads]);

  const handleCloseCritical = () => {
    setShowCritical(false);
    // If there are cold leads, show them after critical is closed
    if (coldLeads && coldLeads.length > 0) {
      setShowCold(true);
    }
  };

  const handleCloseCold = () => {
    setShowCold(false);
  };

  const navigateToLead = (leadId: string) => {
    navigate(`/leads?leadId=${leadId}`);
    setShowCritical(false);
    setShowCold(false);
  };

  if (showCritical && criticalLeads && criticalLeads.length > 0) {
    return (
      <Dialog open={showCritical} onOpenChange={handleCloseCritical}>
        <DialogContent className="sm:max-w-[600px] border-red-200 bg-red-50 dark:bg-red-950/20">
          <DialogHeader>
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-6 w-6" />
              <DialogTitle>Critical Follow-ups Required</DialogTitle>
            </div>
            <DialogDescription className="text-red-700 dark:text-red-300 pt-2">
              Your Matured Party (if mature) or Your almost Mature Lead (for Hot) is about to get wasted. Save it by following Up on time.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] mt-4">
            <div className="space-y-4 pr-4">
              {criticalLeads.map((lead) => (
                <div
                  key={lead._id}
                  className="bg-white dark:bg-card p-4 rounded-lg border shadow-sm flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center"
                >
                  <div>
                    <h4 className="font-semibold text-lg">{lead.name}</h4>
                    <p className="text-sm text-muted-foreground">{lead.agencyName}</p>
                    <div className="flex gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        lead.status === "Mature" 
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                      }`}>
                        {lead.status}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 font-medium">
                        Overdue: {lead.nextFollowUpDate ? format(lead.nextFollowUpDate, "PP") : "Unknown"}
                      </span>
                    </div>
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => navigateToLead(lead._id)}
                  >
                    Follow Up Now
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={handleCloseCritical}>
              Remind Me Later
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (showCold && coldLeads && coldLeads.length > 0) {
    const isPlural = coldLeads.length > 1;
    const description = isPlural 
      ? "These are good leads. Let's convert these leads to be good parties."
      : "This is a good lead. Let's convert this lead to be a good party.";

    return (
      <Dialog open={showCold} onOpenChange={handleCloseCold}>
        <DialogContent className="sm:max-w-[600px] border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <DialogHeader>
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <TrendingUp className="h-6 w-6" />
              <DialogTitle>Boost Your Sales</DialogTitle>
            </div>
            <DialogDescription className="text-blue-700 dark:text-blue-300 pt-2">
              {description}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] mt-4">
            <div className="space-y-4 pr-4">
              {coldLeads.map((lead) => (
                <div
                  key={lead._id}
                  className="bg-white dark:bg-card p-4 rounded-lg border shadow-sm flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center"
                >
                  <div>
                    <h4 className="font-semibold text-lg">{lead.name}</h4>
                    <p className="text-sm text-muted-foreground">{lead.agencyName}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 font-medium">
                        {lead.status}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 font-medium">
                        {lead.type}
                      </span>
                    </div>
                  </div>
                  <Button 
                    variant="default" 
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => navigateToLead(lead._id)}
                  >
                    Take Action
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={handleCloseCold}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}