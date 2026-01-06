import { useNavigate } from "react-router";
import { useFollowUpNotifications } from "@/hooks/useFollowUpNotifications";
import { FollowUpNotificationDialog } from "@/components/followup/FollowUpNotificationDialog";

export function FollowUpNotifications() {
  const navigate = useNavigate();
  const { currentNotification, handleClose } = useFollowUpNotifications();

  const navigateToLead = (leadId: string) => {
    navigate(`/leads?leadId=${leadId}`);
    handleClose();
  };

  if (!currentNotification) return null;

  const { lead, timeType, message } = currentNotification;

  return (
    <FollowUpNotificationDialog
      lead={lead}
      timeType={timeType}
      message={message}
      onClose={handleClose}
      onNavigate={navigateToLead}
    />
  );
}