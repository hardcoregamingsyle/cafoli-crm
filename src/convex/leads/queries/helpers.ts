import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

export async function enrichLeads(ctx: QueryCtx, leads: any[]) {
  return await Promise.all(
    leads.map(async (lead) => {
      let enriched = { ...lead };
      
      if (lead.assignedTo) {
        const assignedUser = await ctx.db.get(lead.assignedTo);
        if (assignedUser && '_id' in assignedUser) {
          const userName = (assignedUser as any).name || (assignedUser as any).email || "Unknown User";
          enriched.assignedToName = userName;
        }
      }

      if (lead.coldCallerAssignedTo) {
        const assignedUser = await ctx.db.get(lead.coldCallerAssignedTo);
        if (assignedUser && '_id' in assignedUser) {
          const userName = (assignedUser as any).name || (assignedUser as any).email || "Unknown User";
          enriched.coldCallerAssignedToName = userName;
        }
      }

      if (lead.tags && lead.tags.length > 0) {
        const tags = [];
        for (const tagId of lead.tags) {
          const tag = await ctx.db.get(tagId);
          if (tag) tags.push(tag);
        }
        enriched.tagsData = tags;
      }

      return enriched;
    })
  );
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
