import { useQuery } from "convex/react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";

export function useFollowUpNotifications() {
  const { user: currentUser } = useAuth();
  const upcomingFollowUps = useQuery(
    api.leads.queries.getUpcomingFollowUps,
    currentUser ? { userId: currentUser._id } : "skip"
  );

  const [shownNotifications, setShownNotifications] = useState<Set<string>>(new Set());
  const [currentNotification, setCurrentNotification] = useState<{
    lead: any;
    timeType: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!upcomingFollowUps || upcomingFollowUps.length === 0) return;

    const checkFollowUps = () => {
      const now = Date.now();

      for (const lead of upcomingFollowUps) {
        if (!lead.nextFollowUpDate) continue;

        const timeUntil = lead.nextFollowUpDate - now;
        const leadId = lead._id;

        // Check for 10 minutes (9:30 to 10:30 minutes)
        if (timeUntil > 9.5 * 60 * 1000 && timeUntil <= 10.5 * 60 * 1000) {
          const key = `${leadId}-10min`;
          if (!shownNotifications.has(key)) {
            setCurrentNotification({
              lead,
              timeType: "10 minutes",
              message: "Follow-up in 10 minutes"
            });
            setShownNotifications(prev => new Set(prev).add(key));
            return;
          }
        }

        // Check for 5 minutes (4:30 to 5:30 minutes)
        if (timeUntil > 4.5 * 60 * 1000 && timeUntil <= 5.5 * 60 * 1000) {
          const key = `${leadId}-5min`;
          if (!shownNotifications.has(key)) {
            setCurrentNotification({
              lead,
              timeType: "5 minutes",
              message: "Follow-up in 5 minutes"
            });
            setShownNotifications(prev => new Set(prev).add(key));
            return;
          }
        }

        // Check for 1 minute (30 seconds to 1:30 minutes)
        if (timeUntil > 30 * 1000 && timeUntil <= 1.5 * 60 * 1000) {
          const key = `${leadId}-1min`;
          if (!shownNotifications.has(key)) {
            setCurrentNotification({
              lead,
              timeType: "1 minute",
              message: "Follow-up in 1 minute"
            });
            setShownNotifications(prev => new Set(prev).add(key));
            return;
          }
        }

        // Check for exact time (within 30 seconds)
        if (timeUntil >= -15 * 1000 && timeUntil <= 30 * 1000) {
          const key = `${leadId}-now`;
          if (!shownNotifications.has(key)) {
            setCurrentNotification({
              lead,
              timeType: "now",
              message: "Follow-up time is NOW!"
            });
            setShownNotifications(prev => new Set(prev).add(key));
            return;
          }
        }
      }
    };

    // Check immediately
    checkFollowUps();

    // Check every 15 seconds
    const interval = setInterval(checkFollowUps, 15000);

    return () => clearInterval(interval);
  }, [upcomingFollowUps, shownNotifications]);

  const handleClose = () => {
    setCurrentNotification(null);
  };

  return {
    currentNotification,
    handleClose,
  };
}
