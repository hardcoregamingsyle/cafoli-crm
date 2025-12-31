import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router";
import { format } from "date-fns";
import { AlertTriangle, TrendingUp, X, BellOff, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function LeadReminders() {
  const criticalLeads = useQuery(api.leadQueries.getCriticalOverdueLeads, {});
  const coldLeads = useQuery(api.leadQueries.getColdOverdueLeads, {});
  const currentUser = useQuery(api.users.currentUser);
  const updatePreferences = useMutation(api.users.updatePreferences);
  const navigate = useNavigate();

  // Queue state: track which batches have been closed in this session
  const [closedBatches, setClosedBatches] = useState<string[]>([]);
  const [dismissedLeadIds, setDismissedLeadIds] = useState<string[]>([]);

  // Check user preference
  const remindersEnabled = currentUser?.preferences?.leadRemindersEnabled !== false;

  const activeCriticalLeads = criticalLeads?.filter(l => !dismissedLeadIds.includes(l._id)) || [];
  const activeColdLeads = coldLeads?.filter(l => !dismissedLeadIds.includes(l._id)) || [];

  // Determine current mode
  let mode: 'critical' | 'cold' | null = null;
  if (remindersEnabled) {
    if (activeCriticalLeads.length > 0 && !closedBatches.includes('critical')) {
      mode = 'critical';
    } else if (activeColdLeads.length > 0 && !closedBatches.includes('cold')) {
      mode = 'cold';
    }
  }

  const handleClose = () => {
    if (mode === 'critical') {
      setClosedBatches(prev => [...prev, 'critical']);
    } else if (mode === 'cold') {
      setClosedBatches(prev => [...prev, 'cold']);
    }
  };

  const navigateToLead = (leadId: string) => {
    navigate(`/leads?leadId=${leadId}`);
    // Close the current batch to allow viewing the page
    handleClose();
  };

  const handleDismiss = (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedLeadIds(prev => [...prev, leadId]);
  };

  const handleDisableReminders = async () => {
    try {
      await updatePreferences({
        preferences: { leadRemindersEnabled: false }
      });
      toast.success("Reminders disabled");
    } catch (error) {
      toast.error("Failed to update preferences");
    }
  };

  if (!mode) return null;

  const isCritical = mode === 'critical';
  const leads = isCritical ? activeCriticalLeads : activeColdLeads;

  // Content configuration based on mode
  const config = isCritical ? {
    borderColor: "border-red-200",
    bgColor: "bg-red-50 dark:bg-red-950/20",
    iconColor: "text-red-600 dark:text-red-400",
    textColor: "text-red-700 dark:text-red-300",
    Icon: AlertTriangle,
    title: "Critical Follow-ups Required",
    description: "Your Matured Party (if mature) or Your almost Mature Lead (for Hot) is about to get wasted. Save it by following Up on time.",
    badgeColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    buttonVariant: "destructive" as const,
  } : {
    borderColor: "border-blue-200",
    bgColor: "bg-blue-50 dark:bg-blue-950/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    textColor: "text-blue-700 dark:text-blue-300",
    Icon: TrendingUp,
    title: "Boost Your Sales",
    description: leads.length > 1 
      ? "These are good leads. Let's convert these leads to be good parties."
      : "This is a good lead. Let's convert this lead to be a good party.",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    buttonVariant: "default" as const,
  };

  const { Icon } = config;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className={cn("sm:max-w-[600px]", config.borderColor, config.bgColor)}>
        <DialogHeader>
          <div className={cn("flex items-center gap-2", config.iconColor)}>
            <Icon className="h-6 w-6" />
            <DialogTitle>{config.title}</DialogTitle>
          </div>
          <DialogDescription className={cn("pt-2", config.textColor)}>
            {config.description}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] mt-4">
          <div className="space-y-4 pr-4">
            {leads.map((lead) => (
              <div
                key={lead._id}
                className="bg-white dark:bg-card p-4 rounded-lg border shadow-sm flex flex-col gap-3 relative group"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => handleDismiss(lead._id, e)}
                  title="Dismiss this reminder"
                >
                  <X className="h-4 w-4" />
                </Button>
                
                <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                  <div>
                    <h4 className="font-semibold text-lg">{lead.name}</h4>
                    <p className="text-sm text-muted-foreground">{lead.agencyName}</p>
                    
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                      {lead.mobile && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span>{lead.mobile}</span>
                        </div>
                      )}
                      {lead.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          <span>{lead.email}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 mt-2">
                      <span className={cn("text-xs px-2 py-1 rounded-full font-medium", 
                        lead.status === "Mature" 
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : lead.status === "Hot"
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                            : config.badgeColor
                      )}>
                        {lead.status}
                      </span>
                      {isCritical && (
                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 font-medium">
                          Overdue: {lead.nextFollowUpDate ? format(lead.nextFollowUpDate, "PP") : "Unknown"}
                        </span>
                      )}
                      {!isCritical && (
                         <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 font-medium">
                           {lead.type}
                         </span>
                      )}
                    </div>
                  </div>
                  <Button 
                    variant={config.buttonVariant}
                    size="sm"
                    className={!isCritical ? "bg-blue-600 hover:bg-blue-700" : ""}
                    onClick={() => navigateToLead(lead._id)}
                  >
                    {isCritical ? "Follow Up Now" : "Take Action"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="flex sm:justify-between items-center mt-4 gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-foreground"
            onClick={handleDisableReminders}
          >
            <BellOff className="h-4 w-4 mr-2" />
            Don't show reminders
          </Button>
          <Button variant="outline" onClick={handleClose}>
            {isCritical ? "Remind Me Later" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}