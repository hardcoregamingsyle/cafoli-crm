import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

export async function enrichLeads(ctx: QueryCtx, leads: any[]) {
  if (leads.length === 0) return [];

  // Collect all unique IDs to batch-fetch
  const userIds = new Set<string>();
  const tagIds = new Set<string>();
  const leadIds = new Set<string>();

  for (const lead of leads) {
    if (lead.assignedTo) userIds.add(lead.assignedTo);
    if (lead.coldCallerAssignedTo) userIds.add(lead.coldCallerAssignedTo);
    if (lead.tags) for (const t of lead.tags) tagIds.add(t);
    if (lead._id && !lead._isR2) leadIds.add(lead._id);
  }

  // Batch fetch all users, tags, and chats in parallel
  const [usersArr, tagsArr, chatsArr] = await Promise.all([
    Promise.all([...userIds].map(id => ctx.db.get(id as Id<"users">))),
    Promise.all([...tagIds].map(id => ctx.db.get(id as Id<"tags">))),
    Promise.all([...leadIds].map(id =>
      ctx.db.query("chats").withIndex("by_lead", q => q.eq("leadId", id as Id<"leads">)).first()
    )),
  ]);

  // Build lookup Maps
  const userMap = new Map<string, any>();
  for (let i = 0; i < [...userIds].length; i++) {
    const u = usersArr[i];
    if (u) userMap.set([...userIds][i], u);
  }

  const tagMap = new Map<string, any>();
  for (let i = 0; i < [...tagIds].length; i++) {
    const t = tagsArr[i];
    if (t) tagMap.set([...tagIds][i], t);
  }

  const chatMap = new Map<string, any>();
  const leadIdsArr = [...leadIds];
  for (let i = 0; i < leadIdsArr.length; i++) {
    const c = chatsArr[i];
    chatMap.set(leadIdsArr[i], c);
  }

  // Apply enrichment in one pass — no more N+1 queries
  return leads.map(lead => {
    const enriched = { ...lead };

    if (lead.assignedTo) {
      const u = userMap.get(lead.assignedTo);
      if (u) enriched.assignedToName = u.name || u.email || "Unknown User";
    }

    if (lead.coldCallerAssignedTo) {
      const u = userMap.get(lead.coldCallerAssignedTo);
      if (u) enriched.coldCallerAssignedToName = u.name || u.email || "Unknown User";
    }

    if (lead.tags && lead.tags.length > 0) {
      enriched.tagsData = lead.tags.map((id: string) => tagMap.get(id)).filter(Boolean);
    }

    if (lead._id && !lead._isR2) {
      const chat = chatMap.get(lead._id);
      enriched.unreadCount = chat?.unreadCount || 0;
    }

    return enriched;
  });
}

export function applyFilters(leads: any[], args: any) {
  let filtered = leads;
  
  if (args.statuses && args.statuses.length > 0) {
    filtered = filtered.filter(l => l.status && args.statuses.includes(l.status));
  }
  
  if (args.sources && args.sources.length > 0) {
    filtered = filtered.filter(l => l.source && args.sources.includes(l.source));
  }
  
  if (args.tags && args.tags.length > 0) {
    filtered = filtered.filter(l => l.tags && args.tags.some((t: Id<"tags">) => l.tags.includes(t)));
  }
  
  if (args.assignedToUsers && args.assignedToUsers.length > 0) {
    filtered = filtered.filter(l => l.assignedTo && args.assignedToUsers.includes(l.assignedTo));
  }
  
  return filtered;
}

export function sortLeads(leads: any[], sortBy?: string) {
  if (!sortBy) return leads;

  return leads.sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return b._creationTime - a._creationTime;
      case "oldest":
        return a._creationTime - b._creationTime;
      case "last_activity":
        return (b.lastActivity || 0) - (a.lastActivity || 0);
      case "priority_score":
        return (b.priorityScore || 0) - (a.priorityScore || 0);
      case "next_followup":
        if (a.nextFollowUpDate && b.nextFollowUpDate) return a.nextFollowUpDate - b.nextFollowUpDate;
        if (a.nextFollowUpDate) return -1;
        if (b.nextFollowUpDate) return 1;
        return 0;
      default:
        return 0;
    }
  });
}