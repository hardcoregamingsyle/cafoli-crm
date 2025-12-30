import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ROLES } from "./schema";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";

// Helper to standardize phone numbers
function standardizePhoneNumber(phone: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return "91" + cleaned;
  }
  return cleaned;
}

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

// Helper to handle follow-up completion
async function handleFollowUpChange(ctx: any, leadId: any, newDate: number | undefined, userId: any) {
  const now = Date.now();
  
  // Find pending follow-ups for this lead
  const pending = await ctx.db
    .query("followups")
    .withIndex("by_lead", (q: any) => q.eq("leadId", leadId))
    .filter((q: any) => q.eq(q.field("status"), "pending"))
    .collect();

  for (const followup of pending) {
    // Determine if it was overdue (grace period 20 mins = 1200000 ms)
    const isOverdue = now > (followup.scheduledAt + 20 * 60 * 1000);
    
    await ctx.db.patch(followup._id, {
      status: "completed",
      completedAt: now,
      completionStatus: isOverdue ? "overdue" : "timely",
    });
  }

  // Schedule new follow-up if provided
  if (newDate) {
    await ctx.db.insert("followups", {
      leadId,
      assignedTo: userId, // Assign to the user making the change or the lead's assignee? Usually the lead's assignee.
      scheduledAt: newDate,
      status: "pending",
    });
  }
}

function generateSearchText(data: {
  name?: string;
  subject?: string;
  mobile?: string;
  altMobile?: string;
  email?: string;
  altEmail?: string;
  message?: string;
}) {
  return [
    data.name,
    data.subject,
    data.mobile,
    data.altMobile,
    data.email,
    data.altEmail,
    data.message
  ].filter(Boolean).join(" ");
}

export const getPaginatedLeads = query({
  args: {
    paginationOpts: paginationOptsValidator,
    filter: v.optional(v.string()), // "all", "unassigned", "mine", "irrelevant"
    userId: v.optional(v.id("users")),
    search: v.optional(v.string()),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.id("tags"))),
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

    // Helper function to enrich leads with assigned user names and tags
    const enrichLeads = async (leads: any[]) => {
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
    };

    // Search logic
    if (args.search) {
      let results = await ctx.db
        .query("leads")
        .withSearchIndex("search_all", (q) => {
          let search = q.search("searchText", args.search!);
          if (args.filter === "mine") {
            search = search.eq("assignedTo", userId);
          }
          return search;
        })
        .take(args.paginationOpts.numItems); 

      // Apply in-memory filters for search results
      if (args.status) {
        results = results.filter(l => l.status === args.status);
      }
      if (args.source) {
        results = results.filter(l => l.source === args.source);
      }
      if (args.tags && args.tags.length > 0) {
        results = results.filter(l => l.tags && args.tags!.some(t => l.tags!.includes(t)));
      }

      // Enrich with user names and tags
      const enrichedResults = await enrichLeads(results);

      return {
        page: enrichedResults,
        isDone: true,
        continueCursor: "",
      };
    }

    // Helper to apply tag filter in memory since we can't easily index array contains with other filters in Convex yet for complex queries
    const applyTagFilter = (leads: any[]) => {
      if (!args.tags || args.tags.length === 0) return leads;
      return leads.filter(l => l.tags && args.tags!.some(t => l.tags!.includes(t)));
    };

    if (args.filter === "mine") {
      // Custom sorting for "mine":
      // 1. Overdue leads (Furthest Followup to Closest Followup) -> Ascending Date
      // 2. Upcoming leads (Closest Followup to Furthest Followup) -> Ascending Date
      // 3. No Followup Date -> Bottom
      
      const allLeads = await ctx.db
        .query("leads")
        .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
        .collect();

      // Filter out irrelevant leads unless specifically asked (though "mine" usually excludes them in previous logic)
      let activeLeads = allLeads.filter(l => l.type !== "Irrelevant");

      // Apply filters
      if (args.status) {
        activeLeads = activeLeads.filter(l => l.status === args.status);
      }
      if (args.source) {
        activeLeads = activeLeads.filter(l => l.source === args.source);
      }
      
      // Apply tag filter
      activeLeads = applyTagFilter(activeLeads);

      const sortedLeads = activeLeads.sort((a, b) => {
        const dateA = a.nextFollowUpDate;
        const dateB = b.nextFollowUpDate;
        
        // If both have dates, sort ascending (Oldest/Overdue first, then Upcoming)
        if (dateA && dateB) {
          return dateA - dateB;
        }
        
        // If one has date and other doesn't, put the one with date first
        if (dateA) return -1;
        if (dateB) return 1;
        
        // If neither has date, sort by lastActivity desc (was creationTime)
        return b.lastActivity - a.lastActivity;
      });

      // Manual pagination
      const { numItems, cursor } = args.paginationOpts;
      const offset = cursor ? parseInt(cursor) : 0;
      const page = sortedLeads.slice(offset, offset + numItems);
      const isDone = offset + numItems >= sortedLeads.length;
      const continueCursor = isDone ? "" : (offset + numItems).toString();

      // Enrich with user names
      const enrichedPage = await enrichLeads(page);

      return {
        page: enrichedPage,
        isDone,
        continueCursor,
      };
    } else {
      // Database query for other views
      // Note: We can't efficiently filter by tags in the DB query with pagination if we are also filtering by other things without a specific index.
      // For now, we will fetch more and filter in memory, or just accept that pagination might be slightly off if we filter heavily.
      // However, since we are using `paginate`, we can't filter the stream easily.
      // If tags are provided, we might need to collect and filter manually if the dataset isn't huge, or use a different strategy.
      // Given the constraints, let's try to use the filter in the query if possible, but `v.array` contains isn't directly supported in `filter` easily for all cases.
      // Actually, we can use `q.or` with `q.eq` for each tag if we want "any", but `tags` is an array field.
      // Convex doesn't support `array_contains` in `filter` efficiently without index.
      // Let's stick to fetching and filtering for now if tags are present, or just ignore tags in the main query and filter in memory (which breaks pagination).
      // To do this correctly with pagination, we should probably use `collect` and manual pagination if filters are complex.
      
      // For this implementation, if tags are present, we'll switch to manual pagination strategy similar to "mine" view to ensure correctness.
      
      if (args.tags && args.tags.length > 0) {
         const allLeads = await ctx.db.query("leads").order("desc").collect();
         let filtered = allLeads.filter(l => {
            // Base filters
            if (args.filter === "unassigned") return !l.assignedTo && l.type !== "Irrelevant";
            if (args.filter === "irrelevant") return l.type === "Irrelevant";
            if (args.filter === "all") return l.type !== "Irrelevant"; // Admin check done later or assumed
            return !l.assignedTo && l.type !== "Irrelevant";
         });

         if (args.status) filtered = filtered.filter(l => l.status === args.status);
         if (args.source) filtered = filtered.filter(l => l.source === args.source);
         filtered = applyTagFilter(filtered);

         // Manual pagination
         const { numItems, cursor } = args.paginationOpts;
         const offset = cursor ? parseInt(cursor) : 0;
         const page = filtered.slice(offset, offset + numItems);
         const isDone = offset + numItems >= filtered.length;
         const continueCursor = isDone ? "" : (offset + numItems).toString();
         
         const enrichedPage = await enrichLeads(page);
         return { page: enrichedPage, isDone, continueCursor };
      }

      const result = await ctx.db
        .query("leads")
        .withIndex("by_last_activity")
        .order("desc")
        .filter((q) => {
          let predicate;
          
          // Base filter logic
          if (args.filter === "unassigned") {
            predicate = q.and(
              q.eq(q.field("assignedTo"), undefined),
              q.neq(q.field("type"), "Irrelevant")
            );
          } else if (args.filter === "irrelevant") {
            predicate = q.eq(q.field("type"), "Irrelevant");
          } else {
            // "all" or default
            predicate = q.neq(q.field("type"), "Irrelevant");
          }

          // Apply additional filters
          if (args.status) {
            predicate = q.and(predicate, q.eq(q.field("status"), args.status));
          }
          if (args.source) {
            predicate = q.and(predicate, q.eq(q.field("source"), args.source));
          }

          return predicate;
        })
        .paginate(args.paginationOpts);

      // Enrich with user names
      const enrichedPage = await enrichLeads(result.page);

      return {
        ...result,
        page: enrichedPage,
      };
    }
  },
});

export const getOverdueLeads = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return [];

    const now = Date.now();
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_assigned_to", (q) => q.eq("assignedTo", userId))
      .collect();
    
    return leads
      .filter(l => l.type !== "Irrelevant" && l.nextFollowUpDate && l.nextFollowUpDate < now)
      .sort((a, b) => (a.nextFollowUpDate || 0) - (b.nextFollowUpDate || 0));
  }
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
      leads = leads.filter(l => l.type !== "Irrelevant");
    } else if (args.filter === "unassigned") {
      // Note: Convex doesn't support querying for null in index directly easily without a specific index or filter
      // We will fetch all and filter for now, or use a custom index strategy. 
      // For simplicity in this iteration, we'll filter in memory or use a "null" sentinel if needed, 
      // but let's try filtering.
      leads = await ctx.db.query("leads").order("desc").collect();
      leads = leads.filter(l => !l.assignedTo && l.type !== "Irrelevant");
    } else if (args.filter === "all") {
      if (user.role !== ROLES.ADMIN) return [];
      leads = await ctx.db.query("leads").order("desc").collect();
      leads = leads.filter(l => l.type !== "Irrelevant");
    } else {
      // Default behavior for /leads page (unassigned)
      leads = await ctx.db.query("leads").order("desc").collect();
      leads = leads.filter(l => !l.assignedTo && l.type !== "Irrelevant");
    }

    return leads;
  },
});

export const getLead = query({
  args: { 
    id: v.id("leads"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = args.userId || await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(args.id);
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

    const mobile = standardizePhoneNumber(args.mobile);

    const searchText = generateSearchText({
      name: args.name,
      subject: args.subject,
      mobile: mobile,
      email: args.email,
      message: args.message,
    });

    const leadId = await ctx.db.insert("leads", {
      name: args.name,
      subject: args.subject,
      source: args.source,
      mobile: mobile,
      email: args.email,
      agencyName: args.agencyName,
      message: args.message,
      status: "Cold",
      type: "To be Decided",
      lastActivity: Date.now(),
      searchText,
    });
    
    // No follow-up scheduled on creation by default unless specified, but here it's not in args.
    
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
      await ctx.scheduler.runAfter(0, internal.whatsappTemplates.sendWelcomeMessage, {
        leadId: leadId,
        phoneNumber: mobile,
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
      comments: v.optional(v.string()), 
      name: v.optional(v.string()),
      mobile: v.optional(v.string()),
      email: v.optional(v.string()),
      agencyName: v.optional(v.string()),
      pincode: v.optional(v.string()),
      state: v.optional(v.string()),
      district: v.optional(v.string()),
      station: v.optional(v.string()),
      tags: v.optional(v.array(v.id("tags"))),
    }),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");
    
    // Get the lead to check if it's assigned
    const lead = await ctx.db.get(args.id);
    if (!lead) throw new Error("Lead not found");

    // Validate tags limit
    if (args.patch.tags && args.patch.tags.length > 8) {
      throw new Error("Maximum of 8 tags allowed per lead");
    }

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

      // Handle follow-up history
      const assignee = args.patch.assignedTo || lead.assignedTo || userId;
      await handleFollowUpChange(ctx, args.id, followUpDate, assignee);
    }

    // Check if lead is assigned and requires follow-up date
    const isAssigned = args.patch.assignedTo !== undefined ? args.patch.assignedTo : lead.assignedTo;
    if (isAssigned) {
      const hasFollowUpDate = args.patch.nextFollowUpDate !== undefined ? args.patch.nextFollowUpDate : lead.nextFollowUpDate;
      if (!hasFollowUpDate) {
        throw new Error("Follow-up date is required for assigned leads");
      }
    }

    // Standardize mobile if present
    let mobile = lead.mobile;
    if (args.patch.mobile) {
      mobile = standardizePhoneNumber(args.patch.mobile);
    }

    // Calculate new search text
    const merged = {
      name: args.patch.name ?? lead.name,
      subject: lead.subject, // subject is not in patch currently
      mobile: mobile,
      altMobile: lead.altMobile, // altMobile is not in patch currently
      email: args.patch.email ?? lead.email,
      altEmail: lead.altEmail, // altEmail is not in patch currently
      message: args.patch.message ?? lead.message,
    };
    const searchText = generateSearchText(merged);

    const patchUpdates = { ...args.patch };
    if (patchUpdates.mobile) {
      patchUpdates.mobile = mobile;
    }

    await ctx.db.patch(args.id, {
      ...patchUpdates,
      searchText,
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
    
    // Check for admin assignment requirement
    if (lead.adminAssignmentRequired && currentUser?.role !== ROLES.ADMIN) {
      throw new Error("This lead can only be assigned by an admin");
    }

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
    
    // Handle follow-up history
    await handleFollowUpChange(ctx, args.leadId, followUpDate, args.userId);

    await ctx.db.patch(args.leadId, {
      assignedTo: args.userId,
      nextFollowUpDate: args.nextFollowUpDate,
      lastActivity: Date.now(),
      // Clear the admin requirement once assigned? 
      // Or keep it? Usually once assigned it's fine. 
      // Let's clear it so it behaves normally after assignment.
      adminAssignmentRequired: undefined, 
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
        let userName = "System";
        let userImage = undefined;

        if (c.userId) {
          const user = await ctx.db.get(c.userId);
          userName = user?.name || "Unknown";
          userImage = user?.image;
        } else if (c.isSystem) {
          userName = "System";
        }

        return {
          ...c,
          userName,
          userImage,
        };
      })
    );

    return commentsWithUser;
  },
});

export const getAllLeadsForExport = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) throw new Error("Unauthorized");
    
    const user = await ctx.db.get(userId);
    if (user?.role !== ROLES.ADMIN) {
      throw new Error("Only admins can export all leads");
    }

    // Fetch all leads
    const leads = await ctx.db.query("leads").collect();
    
    // Enrich with assigned user names
    const enrichedLeads = await Promise.all(
      leads.map(async (lead) => {
        let assignedToName = "";
        if (lead.assignedTo) {
          const assignedUser = await ctx.db.get(lead.assignedTo);
          assignedToName = assignedUser?.name || "";
        }
        
        return {
          ...lead,
          assignedToName,
        };
      })
    );

    return enrichedLeads;
  },
});

export const getNextDownloadNumber = query({
  args: {},
  handler: async (ctx) => {
    const lastExport = await ctx.db
      .query("exportLogs")
      .order("desc")
      .first();
    
    return (lastExport?.downloadNumber || 0) + 1;
  },
});

export const logExport = mutation({
  args: {
    userId: v.id("users"),
    downloadNumber: v.number(),
    fileName: v.string(),
    leadCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("exportLogs", {
      userId: args.userId,
      downloadNumber: args.downloadNumber,
      fileName: args.fileName,
      leadCount: args.leadCount,
      exportedAt: Date.now(),
    });
  },
});

export const standardizeAllPhoneNumbers = mutation({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    // Check admin permission
    const admin = await ctx.db.get(args.adminId);
    if (!admin || admin.role !== ROLES.ADMIN) {
      throw new Error("Only admins can standardize phone numbers");
    }

    // Fetch all leads
    const allLeads = await ctx.db.query("leads").collect();
    
    let updatedCount = 0;
    let mergedCount = 0;
    const processedMobiles = new Set<string>();

    for (const lead of allLeads) {
      const originalMobile = lead.mobile;
      const standardizedMobile = standardizePhoneNumber(originalMobile);
      
      // Skip if already standardized
      if (originalMobile === standardizedMobile) {
        continue;
      }

      // Check if this standardized number already exists in another lead
      if (processedMobiles.has(standardizedMobile)) {
        // This is a duplicate - we'll handle it by marking for manual review
        await ctx.db.insert("comments", {
          leadId: lead._id,
          content: `Duplicate phone number detected after standardization: ${standardizedMobile}. Please review and merge manually.`,
          isSystem: true,
        });
        mergedCount++;
        continue;
      }

      // Update the lead with standardized mobile
      await ctx.db.patch(lead._id, {
        mobile: standardizedMobile,
        lastActivity: Date.now(),
      });

      processedMobiles.add(standardizedMobile);
      updatedCount++;
    }

    return {
      success: true,
      updatedCount,
      duplicatesFound: mergedCount,
      totalLeads: allLeads.length,
    };
  },
});

export const bulkImportLeads = mutation({
  args: {
    leads: v.array(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
        altEmail: v.optional(v.string()),
        mobile: v.string(),
        altMobile: v.optional(v.string()),
        source: v.optional(v.string()),
        assignedToName: v.optional(v.string()),
        agencyName: v.optional(v.string()),
        pincode: v.optional(v.string()),
        station: v.optional(v.string()),
        state: v.optional(v.string()),
        district: v.optional(v.string()),
        subject: v.optional(v.string()),
        message: v.optional(v.string()),
      })
    ),
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const adminId = args.adminId;
    if (!adminId) throw new Error("Unauthorized");

    const admin = await ctx.db.get(adminId);
    if (admin?.role !== ROLES.ADMIN) {
      throw new Error("Only admins can import leads");
    }

    // Fetch all users to resolve assignedToName
    const allUsers = await ctx.db.query("users").collect();
    const userMap = new Map<string, string>(); // Name/Email -> ID
    
    for (const user of allUsers) {
      if (user.name) userMap.set(user.name.toLowerCase(), user._id);
      if (user.email) userMap.set(user.email.toLowerCase(), user._id);
    }

    let importedCount = 0;

    for (const leadData of args.leads) {
      // Resolve Assigned To
      let assignedTo = undefined;
      if (leadData.assignedToName) {
        const lookup = leadData.assignedToName.toLowerCase().trim();
        if (userMap.has(lookup)) {
          assignedTo = userMap.get(lookup);
        }
      }

      // Default Source
      const source = leadData.source && leadData.source.trim() !== "" 
        ? leadData.source 
        : "Manual Import";

      const mobile = standardizePhoneNumber(leadData.mobile);

      // Generate Search Text
      const searchText = [
        leadData.name,
        leadData.subject,
        mobile,
        leadData.altMobile,
        leadData.email,
        leadData.altEmail,
        leadData.message,
        leadData.agencyName,
        leadData.station,
        leadData.district,
        leadData.state
      ].filter(Boolean).join(" ");

      await ctx.db.insert("leads", {
        name: leadData.name,
        email: leadData.email,
        altEmail: leadData.altEmail,
        mobile: mobile,
        altMobile: leadData.altMobile,
        source: source,
        assignedTo: assignedTo as any, // Cast to any to satisfy ID type if needed, or let Convex validate
        agencyName: leadData.agencyName,
        pincode: leadData.pincode,
        station: leadData.station,
        state: leadData.state,
        district: leadData.district,
        subject: leadData.subject || "Imported Lead",
        message: leadData.message,
        status: "Cold",
        type: "To be Decided",
        lastActivity: Date.now(),
        searchText,
        // If assigned, we should probably set a follow-up date? 
        // The prompt doesn't specify, but usually assigned leads need one.
        // For now, we'll leave it null as per prompt "Assigned To...". 
        // If the system requires it, we might need to set a default.
        // But createLead doesn't enforce it for unassigned. 
        // If assigned, updateLead enforces it. Let's see.
        // We'll leave it undefined.
      });

      importedCount++;
    }

    return { importedCount };
  },
});