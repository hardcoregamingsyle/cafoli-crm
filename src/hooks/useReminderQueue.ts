import { useState } from "react";

export function useReminderQueue() {
  const [closedBatches, setClosedBatches] = useState<string[]>([]);
  const [dismissedLeadIds, setDismissedLeadIds] = useState<string[]>([]);

  const closeCurrentBatch = (mode: 'critical' | 'cold' | null) => {
    if (mode === 'critical') {
      setClosedBatches(prev => [...prev, 'critical']);
    } else if (mode === 'cold') {
      setClosedBatches(prev => [...prev, 'cold']);
    }
  };

  const dismissLead = (leadId: string) => {
    setDismissedLeadIds(prev => [...prev, leadId]);
  };

  const filterActiveLeads = (leads: any[] | undefined) => {
    return leads?.filter((l: any) => !dismissedLeadIds.includes(l._id)) || [];
  };

  const determineMode = (
    remindersEnabled: boolean,
    activeCriticalLeads: any[],
    activeColdLeads: any[]
  ): 'critical' | 'cold' | null => {
    if (!remindersEnabled) return null;
    
    if (activeCriticalLeads.length > 0 && !closedBatches.includes('critical')) {
      return 'critical';
    } else if (activeColdLeads.length > 0 && !closedBatches.includes('cold')) {
      return 'cold';
    }
    
    return null;
  };

  return {
    closedBatches,
    dismissedLeadIds,
    closeCurrentBatch,
    dismissLead,
    filterActiveLeads,
    determineMode,
  };
}
