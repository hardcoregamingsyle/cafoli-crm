import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ROLES } from "./schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";

// Helper to check permissions
async function checkRole(ctx: any, allowedRoles: string[]) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized");
  
  const user = await ctx.db.get(userId);
  if (!user || !user.role || !allowedRoles.includes(user.role)) {
    // Allow if user is admin, they can do anything usually, but let's be strict
    if (user?.role === ROLES.ADMIN) return user;
    throw new Error("Permission denied");
  }
  return user;
}

export const getPaginatedLeads = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filter: v.optional(v.string()), // "all", "unassigned", "mine"
    userId: v.optional(v.id("users")),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    
    // Basic auth check - if no user, return empty page
    if (!userId) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    const user = await ctx.db.get(userId);
    if (!user) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    // Search logic
    if (args.search) {
      // If search looks like a phone number (mostly digits), use exact match on mobile
      const isPhoneNumber = /^[\d\+\-\s]+$/.test(args.search);
      
      if (isPhoneNumber) {
        // Clean the search string for mobile check
        const cleanSearch = args.search.replace(/\s+/g, "");
        // We can't easily paginate a .filter() on all leads for partial match without full scan
        // But we can use the by_mobile index for exact match or range if we had it.
        // For now, let's use the search index on name as primary search, 
        // but for mobile we might have to scan or use a specific index strategy.
        // Given the constraints, let's try to use the search index for name, 
        // and if it fails, maybe we just return empty or rely on client side for small sets?
        // No, 50m leads.
        // Let's assume search is primarily by name for now using the search index.
        // If we want to search mobile, we should probably use a filter on the search query or a separate index.
        // Let's stick to name search for now as defined in schema.
      }

      return await ctx.db
        .query("leads")
        .withSearchIndex("search_name", (q) => {
          let search = q.search("name", args.search!);
          if (args.filter === "mine") {
            search = search.eq("assignedTo", userId);
          }
          return search;
        })
        .take(args.paginationOpts.numItems); 
    }

    if (args.filter === "mine") {
      return await ctx.db
        .query("leads")
        .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.filter === "unassigned") {
      // Filter for unassigned leads. 
      // Since "assignedTo" is optional and missing in unassigned leads, they are not in the index.
      // We must use a filter.
      return await ctx.db
        .query("leads")
        .order("desc")
        .filter((q) => q.eq(q.field("assignedTo"), undefined))
        .paginate(args.paginationOpts);
    } else if (args.filter === "all") {
      // Admin view or all leads
      return await ctx.db
        .query("leads")
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      // Default to unassigned
      return await ctx.db
        .query("leads")
        .order("desc")
        .filter((q) => q.eq(q.field("assignedTo"), undefined))
        .paginate(args.paginationOpts);
    }
  },
});

export const getLeads = query({
  args: {
    filter: v.optional(v.string()), // "all", "unassigned", "mine"
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];
    
    const user = await ctx.db.get(userId);
    if (!user) return [];

    let leads;

    if (args.filter === "mine") {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
        .order("desc")
        .collect();
    } else if (args.filter === "unassigned") {
      // Note: Convex doesn't support querying for null in index directly easily without a specific index or filter
      // We will fetch all and filter for now, or use a custom index strategy. 
      // For simplicity in this iteration, we'll filter in memory or use a "null" sentinel if needed, 
      // but let's try filtering.
      leads = await ctx.db.query("leads").order("desc").collect();
      leads = leads.filter(l => !l.assignedTo);
    } else if (args.filter === "all") {
      if (user.role !== ROLES.ADMIN) return [];
      leads = await ctx.db.query("leads").order("desc").collect();
    } else {
      // Default behavior for /leads page (unassigned)
      leads = await ctx.db.query("leads").order("desc").collect();
      leads = leads.filter(l => !l.assignedTo);
    }

    return leads;
  },
});

export const createLead = mutation({
  args: {
    name: v.string(),
    subject: v.string(),
    source: v.string(),
    mobile: v.string(),
    email: v.optional(v.string()),
    agencyName: v.optional(v.string()),
    message: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");

    const leadId = await ctx.db.insert("leads", {
      name: args.name,
      subject: args.subject,
      source: args.source,
      mobile: args.mobile,
      email: args.email,
      agencyName: args.agencyName,
      message: args.message,
      status: "Cold",
      type: "To be Decided",
      lastActivity: Date.now(),
    });
    
    // Send welcome email for manually created leads if email is provided
    if (args.email) {
      try {
        await ctx.scheduler.runAfter(0, internal.brevo.sendWelcomeEmail, {
          leadName: args.name,
          leadEmail: args.email,
          source: args.source,
        });
      } catch (error) {
        console.error("Failed to schedule welcome email:", error);
        // Don't throw - lead creation should succeed even if email fails
      }
    }
    
    // Send WhatsApp welcome template for new leads
    try {
      await ctx.scheduler.runAfter(0, internal.whatsappMutations.sendWelcomeTemplate, {
        leadId: leadId,
        phoneNumber: args.mobile,
      });
    } catch (error) {
      console.error("Failed to schedule welcome WhatsApp template:", error);
      // Don't throw - lead creation should succeed even if WhatsApp fails
    }
    
    return leadId;
  },
});

export const updateLead = mutation({
  args: {
    id: v.id("leads"),
    patch: v.object({
      status: v.optional(v.string()),
      type: v.optional(v.string()),
      assignedTo: v.optional(v.id("users")),
      nextFollowUpDate: v.optional(v.number()),
      message: v.optional(v.string()),
      comments: v.optional(v.string()), // We'll handle comments separately but maybe update message
      // Add other fields as needed
      name: v.optional(v.string()),
      mobile: v.optional(v.string()),
      email: v.optional(v.string()),
      agencyName: v.optional(v.string()),
      pincode: v.optional(v.string()),
      state: v.optional(v.string()),
      district: v.optional(v.string()),
      station: v.optional(v.string()),
    }),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");
    
    // Get the lead to check if it's assigned
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new Error("Lead not found");

    // Validate follow-up date constraints
    if (args.patch.nextFollowUpDate !== undefined) {
      const followUpDate = args.patch.nextFollowUpDate;
      const now = Date.now();
      const maxFutureDate = now + (31 * 24 * 60 * 60 * 1000); // 31 days from now

      if (followUpDate <= now) {
        throw new Error("Follow-up date must be in the future");
      }

      if (followUpDate > maxFutureDate) {
        throw new Error("Follow-up date cannot be more than 31 days in the future");
      }
    }

    // Check if lead is assigned and requires follow-up date
    const isAssigned = args.patch.assignedTo !== undefined ? args.patch.assignedTo : lead.assignedTo;
    if (isAssigned) {
      const hasFollowUpDate = args.patch.nextFollowUpDate !== undefined ? args.patch.nextFollowUpDate : lead.nextFollowUpDate;
      if (!hasFollowUpDate) {
        throw new Error("Follow-up date is required for assigned leads");
      }
    }

    await ctx.db.patch(args.id, {
      ...args.patch,
      lastActivity: Date.now(),
    });
  },
});

export const assignLead = mutation({
  args: {
    leadId: v.id("leads"),
    userId: v.id("users"),
    adminId: v.id("users"),
    nextFollowUpDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentUserId = args.adminId;
    if (!currentUserId) throw new Error("Unauthorized");
    
    const currentUser = await ctx.db.get(currentUserId);
    const lead = await ctx.db.get(args.leadId);
    
    if (!lead) throw new Error("Lead not found");
    
    // Staff can only assign to themselves
    if (currentUser?.role === ROLES.STAFF && args.userId !== currentUserId) {
      throw new Error("Staff can only assign leads to themselves");
    }
    
    // Require follow-up date when assigning
    if (!args.nextFollowUpDate) {
      throw new Error("Follow-up date is required when assigning a lead");
    }
    
    // Validate follow-up date constraints
    const followUpDate = args.nextFollowUpDate;
    const now = Date.now();
    const maxFutureDate = now + (31 * 24 * 60 * 60 * 1000); // 31 days from now

    if (followUpDate <= now) {
      throw new Error("Follow-up date must be in the future");
    }

    if (followUpDate > maxFutureDate) {
      throw new Error("Follow-up date cannot be more than 31 days in the future");
    }
    
    await ctx.db.patch(args.leadId, {
      assignedTo: args.userId,
      nextFollowUpDate: args.nextFollowUpDate,
      lastActivity: Date.now(),
    });
  },
});

export const addComment = mutation({
  args: {
    leadId: v.id("leads"),
    content: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.insert("comments", {
      leadId: args.leadId,
      userId,
      content: args.content,
    });

    await ctx.db.patch(args.leadId, {
      lastActivity: Date.now(),
    });
  },
});

export const getComments = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .order("desc")
      .collect();

    // Enrich with user info
    const commentsWithUser = await Promise.all(
      comments.map(async (c) => {
        const user = await ctx.db.get(c.userId);
        return {
          ...c,
          userName: user?.name || "Unknown",
          userImage: user?.image,
        };
      })
    );

    return commentsWithUser;
  },
});