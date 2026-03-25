const lead = leads.find((l: any) => l._id === leadId);
if (!lead) {
  toast.error("Contact not found");
  return;
}
