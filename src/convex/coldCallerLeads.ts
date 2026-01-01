import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { ROLES } from "./schema";

// Mark leads unassigned for 24+ hours as cold caller leads
export const markColdCallerLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    const unassignedLeads = await ctx.db
      .query("leads")
      .filter((q) => q.and(
        q.eq(q.field("assignedTo"), undefined),
        q.neq(q.field("type"), "Irrelevant"),
        q.neq(q.field("isColdCallerLead"), true),
        q.lt(q.field("_creationTime"), twentyFourHoursAgo)
      ))
      .collect();
    
    for (const lead of unassignedLeads) {
      await ctx.db.patch(lead._id, {
        isColdCallerLead: true,
      });
      
      // Add system comment
      await ctx.db.insert("comments", {
        leadId: lead._id,
        content: "Lead marked as Cold Caller Lead (unassigned for 24+ hours)",
        isSystem: true,
      });
    }
    
    return { markedCount: unassignedLeads.length };
  },
});

// Manual trigger for admin to mark all eligible leads as cold caller leads
export const manualMarkColdCallerLeads = mutation({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can manually mark cold caller leads");
    }

    // Remove 24-hour restriction for manual marking
    const unassignedLeads = await ctx.db
      .query("leads")
      .filter((q) => q.and(
        q.eq(q.field("assignedTo"), undefined),
        q.neq(q.field("type"), "Irrelevant")
      ))
      .collect();
    
    let markedCount = 0;
    
    for (const lead of unassignedLeads) {
      // Only mark if not already a cold caller lead
      if (!lead.isColdCallerLead) {
        await ctx.db.patch(lead._id, {
          isColdCallerLead: true,
        });
        
        // Add system comment
        await ctx.db.insert("comments", {
          leadId: lead._id,
          content: "Lead manually marked as Cold Caller Lead by admin",
          isSystem: true,
        });
        
        markedCount++;
      }
    }
    
    return { 
      markedCount, 
      totalUnassigned: unassignedLeads.length,
      alreadyMarked: unassignedLeads.length - markedCount
    };
  },
});

// Get count of unallocated cold caller leads
export const getUnallocatedColdCallerCount = query({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      return 0;
    }

    const unallocatedLeads = await ctx.db
      .query("leads")
      .withIndex("by_is_cold_caller", (q) => q.eq("isColdCallerLead", true))
      .filter((q) => q.eq(q.field("coldCallerAssignedTo"), undefined))
      .collect();
    
    return unallocatedLeads.length;
  },
});

// Manual allocation of cold caller leads by admin
export const manualAllocateColdCallerLeads = mutation({
  args: { 
    adminId: v.id("users"),
    leadsPerStaff: v.number()
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can allocate cold caller leads");
    }

    // Get all staff users
    const allUsers = await ctx.db.query("users").collect();
    const staffUsers = allUsers.filter(u => u.role === ROLES.STAFF);
    
    if (staffUsers.length === 0) {
      throw new Error("No staff users found");
    }

    // Get unallocated cold caller leads
    const availableLeads = await ctx.db
      .query("leads")
      .withIndex("by_is_cold_caller", (q) => q.eq("isColdCallerLead", true))
      .filter((q) => q.eq(q.field("coldCallerAssignedTo"), undefined))
      .collect();
    
    if (availableLeads.length === 0) {
      throw new Error("No unallocated cold caller leads available");
    }

    const totalRequested = args.leadsPerStaff * staffUsers.length;
    let allocatedCount = 0;
    let leadIndex = 0;
    
    // Distribute leads evenly among staff
    const leadsPerStaffActual = Math.min(
      args.leadsPerStaff,
      Math.floor(availableLeads.length / staffUsers.length)
    );
    const remainder = Math.min(
      availableLeads.length - (leadsPerStaffActual * staffUsers.length),
      staffUsers.length
    );
    
    for (let i = 0; i < staffUsers.length && leadIndex < availableLeads.length; i++) {
      const user = staffUsers[i];
      const leadsToAssign = leadsPerStaffActual + (i < remainder ? 1 : 0);
      
      for (let j = 0; j < leadsToAssign && leadIndex < availableLeads.length; j++) {
        const lead = availableLeads[leadIndex];
        await ctx.db.patch(lead._id, {
          coldCallerAssignedTo: user._id,
          coldCallerAssignedAt: Date.now(),
        });
        
        await ctx.db.insert("comments", {
          leadId: lead._id,
          content: `Cold Caller Lead allocated to ${user.name || user.email} by admin`,
          isSystem: true,
        });
        
        leadIndex++;
        allocatedCount++;
      }
    }
    
    return { 
      allocatedCount, 
      staffCount: staffUsers.length,
      availableLeads: availableLeads.length,
      requested: totalRequested
    };
  },
});

// Allocate 10 cold caller leads to each staff member (Mon-Fri IST)
export const allocateColdCallerLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if today is Saturday (6) or Sunday (0) in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const dayOfWeek = istTime.getUTCDay();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { message: "Skipping allocation on weekend" };
    }
    
    // Get all staff users
    const allUsers = await ctx.db.query("users").collect();
    const staffUsers = allUsers.filter(u => u.role === ROLES.STAFF);
    
    // Get unallocated cold caller leads
    const availableLeads = await ctx.db
      .query("leads")
      .withIndex("by_is_cold_caller", (q) => q.eq("isColdCallerLead", true))
      .filter((q) => q.eq(q.field("coldCallerAssignedTo"), undefined))
      .take(staffUsers.length * 10);
    
    let allocatedCount = 0;
    
    for (const user of staffUsers) {
      const userLeads = availableLeads.slice(allocatedCount, allocatedCount + 10);
      
      for (const lead of userLeads) {
        await ctx.db.patch(lead._id, {
          coldCallerAssignedTo: user._id,
          coldCallerAssignedAt: Date.now(),
        });
        
        await ctx.db.insert("comments", {
          leadId: lead._id,
          content: `Cold Caller Lead allocated to ${user.name || user.email}`,
          isSystem: true,
        });
      }
      
      allocatedCount += userLeads.length;
    }
    
    return { allocatedCount, staffCount: staffUsers.length };
  },
});

// Get cold caller leads for current user
export const getMyColdCallerLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_cold_caller_assigned_to", (q) => q.eq("coldCallerAssignedTo", args.userId))
      .filter((q) => q.eq(q.field("isColdCallerLead"), true))
      .collect();
    
    return leads;
  },
});

// Get cold caller leads without follow-up dates
export const getColdCallerLeadsNeedingFollowUp = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_cold_caller_assigned_to", (q) => q.eq("coldCallerAssignedTo", args.userId))
      .filter((q) => q.and(
        q.eq(q.field("isColdCallerLead"), true),
        q.eq(q.field("nextFollowUpDate"), undefined)
      ))
      .collect();
    
    return leads;
  },
});

// Get all cold caller leads (admin only)
export const getAllColdCallerLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    
    const user = await ctx.db.get(args.userId);
    if (user?.role !== ROLES.ADMIN) return [];
    
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_is_cold_caller", (q) => q.eq("isColdCallerLead", true))
      .collect();
    
    // Enrich with assigned user names
    const enrichedLeads = await Promise.all(
      leads.map(async (lead) => {
        let assignedUserName = "";
        if (lead.coldCallerAssignedTo) {
          const assignedUser = await ctx.db.get(lead.coldCallerAssignedTo);
          assignedUserName = assignedUser?.name || assignedUser?.email || "";
        }
        return {
          ...lead,
          coldCallerAssignedToName: assignedUserName,
        };
      })
    );
    
    return enrichedLeads;
  },
});

// Get overdue follow-ups for admin notification (3+ days overdue)
export const getOverdueColdCallerLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    
    const user = await ctx.db.get(args.userId);
    if (user?.role !== ROLES.ADMIN) return [];
    
    const now = Date.now();
    const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
    
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_is_cold_caller", (q) => q.eq("isColdCallerLead", true))
      .filter((q) => q.and(
        q.neq(q.field("nextFollowUpDate"), undefined),
        q.lt(q.field("nextFollowUpDate"), threeDaysAgo)
      ))
      .collect();
    
    // Enrich with assigned user names
    const enrichedLeads = await Promise.all(
      leads.map(async (lead) => {
        let assignedUserName = "";
        if (lead.coldCallerAssignedTo) {
          const assignedUser = await ctx.db.get(lead.coldCallerAssignedTo);
          assignedUserName = assignedUser?.name || assignedUser?.email || "";
        }
        return {
          ...lead,
          coldCallerAssignedToName: assignedUserName,
        };
      })
    );
    
    return enrichedLeads;
  },
});