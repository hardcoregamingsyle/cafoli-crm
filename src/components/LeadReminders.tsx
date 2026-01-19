import { useQuery, useMutation } from "convex/react";
import { useAuth } from "@/hooks/use-auth";
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
import { useNavigate } from "react-router-dom";
import { BellOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getConvexApi } from "@/lib/convex-api";
import { useReminderQueue } from "@/hooks/useReminderQueue";
import { getReminderConfig } from "@/components/reminders/reminderConfig";
import { ReminderLeadCard } from "@/components/reminders/ReminderLeadCard";

export function LeadReminders() {
  const { user: currentUser } = useAuth();
  const api = getConvexApi();
  const criticalLeads = useQuery(
    (api as any).leads.queries.getCriticalOverdueLeads,
    currentUser ? { userId: currentUser._id } : "skip"
  );
  const coldLeads = useQuery(
    (api as any).leads.queries.getColdOverdueLeads,
    currentUser ? { userId: currentUser._id } : "skip"
  );
  const updatePreferences = useMutation((api as any).users.updatePreferences);
  const navigate = useNavigate();

  const {
    closeCurrentBatch,
    dismissLead,
    filterActiveLeads,
    determineMode,
  } = useReminderQueue();

  const remindersEnabled = currentUser?.preferences?.leadRemindersEnabled !== false;

  const activeCriticalLeads = filterActiveLeads(criticalLeads);
  const activeColdLeads = filterActiveLeads(coldLeads);

  const mode = determineMode(remindersEnabled, activeCriticalLeads, activeColdLeads);

  const handleClose = () => {
    closeCurrentBatch(mode);
  };

  const navigateToLead = (leadId: string) => {
    navigate(`/leads?leadId=${leadId}`);
    handleClose();
  };

  const handleDismiss = (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissLead(leadId);
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

  const config = getReminderConfig(isCritical, leads.length);
  const { Icon } = config;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className={cn("sm:max-w-[600px] max-h-[85vh] overflow-auto", config.borderColor, config.bgColor)}>
        <DialogHeader>
          <div className={cn("flex items-center gap-2", config.iconColor)}>
            <Icon className="h-6 w-6" />
            <DialogTitle>{config.title}</DialogTitle>
          </div>
          <DialogDescription className={cn("pt-2", config.textColor)}>
            {config.description}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] mt-4 overflow-auto">
          <div className="space-y-4 pr-4">
            {leads.map((lead: any) => (
              <ReminderLeadCard
                key={lead._id}
                lead={lead}
                isCritical={isCritical}
                badgeColor={config.badgeColor}
                buttonVariant={config.buttonVariant}
                onNavigate={navigateToLead}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        </div>
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