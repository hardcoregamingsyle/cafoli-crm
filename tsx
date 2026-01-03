{/* Show reminders first, then mandatory follow-up popup */}
{filter === "mine" && !hasMandatoryFollowUps && <LeadReminders />}
{filter === "mine" && hasMandatoryFollowUps && <MandatoryFollowUpPopup leads={leadsWithoutFollowUp} />}

// Determine current mode
let mode: 'critical' | 'cold' | null = null;
if (remindersEnabled) {
  if (activeCriticalLeads.length > 0 && !closedBatches.includes('critical')) {
    mode = 'critical';
  } else if (activeColdLeads.length > 0 && !closedBatches.includes('cold')) {
    mode = 'cold';
  }
}

const leadsWithoutFollowUp = useQuery(
  api.leads.queries.getMyLeadsWithoutFollowUp,
  user && filter === "mine" ? { userId: user._id } : "skip"
);
  
const hasMandatoryFollowUps = leadsWithoutFollowUp && leadsWithoutFollowUp.length > 0;

const allUsers = useQuery(api.users.getAllUsers, user ? { userId: user._id } : "skip") || [];

const assignLead = useMutation(api.leads.standard.assignLead);

return (
  <AppLayout>
    <div className="h-[calc(100vh-4rem)] flex flex-col gap-4">
      
    </div>
  </AppLayout>
);