import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { ROLES } from "../schema";

export const autoAssignUnassignedLeads = mutation({
  args: {
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can auto-assign leads");
    }

    // Get all staff users
    const allUsers = await ctx.db.query("users").collect();
    const staffUsers = allUsers.filter(u => u.role === ROLES.STAFF);
    
    if (staffUsers.length === 0) {
      throw new Error("No staff users found to assign leads to");
    }

    // Get all leads that are unassigned or have invalid assignee
    const allLeads = await ctx.db.query("leads").collect();
    
    const unassignedLeads = [];
    for (const lead of allLeads) {
      // Skip irrelevant leads and cold caller leads
      if (lead.type === "Irrelevant" || lead.isColdCallerLead) {
        continue;
      }

      // Check if lead is unassigned
      if (!lead.assignedTo) {
        unassignedLeads.push(lead);
        continue;
      }

      // Check if assignee is valid
      const assignee = await ctx.db.get(lead.assignedTo);
      if (!assignee) {
        unassignedLeads.push(lead);
      }
    }

    if (unassignedLeads.length === 0) {
      return {
        success: true,
        assignedCount: 0,
        staffCount: staffUsers.length,
        message: "No unassigned leads found",
      };
    }

    // Distribute leads evenly among staff
    const leadsPerStaff = Math.floor(unassignedLeads.length / staffUsers.length);
    const remainder = unassignedLeads.length % staffUsers.length;
    
    let assignedCount = 0;
    let leadIndex = 0;

    for (let i = 0; i < staffUsers.length; i++) {
      const user = staffUsers[i];
      const leadsToAssign = leadsPerStaff + (i < remainder ? 1 : 0);
      
      for (let j = 0; j < leadsToAssign && leadIndex < unassignedLeads.length; j++) {
        const lead = unassignedLeads[leadIndex];
        
        await ctx.db.patch(lead._id, {
          assignedTo: user._id,
          lastActivity: Date.now(),
        });
        
        await ctx.db.insert("comments", {
          leadId: lead._id,
          content: `Lead auto-assigned to ${user.name || user.email} by admin`,
          isSystem: true,
        });
        
        leadIndex++;
        assignedCount++;
      }
    }

    return {
      success: true,
      assignedCount,
      staffCount: staffUsers.length,
      totalUnassigned: unassignedLeads.length,
    };
  },
});
