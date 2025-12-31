import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.STAFF),
);
export type Role = Infer<typeof roleValidator>;

export const LEAD_STATUS = {
  COLD: "Cold",
  HOT: "Hot",
  MATURE: "Mature",
} as const;

export const LEAD_TYPE = {
  TBD: "To be Decided",
  RELEVANT: "Relevant",
  IRRELEVANT: "Irrelevant",
} as const;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
      passwordHash: v.optional(v.string()), // hashed password for password authentication
      
      preferences: v.optional(v.object({
        leadRemindersEnabled: v.optional(v.boolean()),
      })),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    leads: defineTable({
      name: v.string(),
      subject: v.string(),
      source: v.string(), // e.g., "Pharmavends", "IndiaMART", "Manual"
      assignedTo: v.optional(v.id("users")),
      
      // Contact Info
      mobile: v.string(),
      altMobile: v.optional(v.string()),
      email: v.optional(v.string()),
      altEmail: v.optional(v.string()),
      
      // Details
      agencyName: v.optional(v.string()),
      pincode: v.optional(v.string()),
      state: v.optional(v.string()),
      district: v.optional(v.string()),
      station: v.optional(v.string()),
      message: v.optional(v.string()),
      
      // Status & Classification
      status: v.optional(v.string()), // Cold, Hot, Mature
      type: v.optional(v.string()), // To be Decided, Relevant, Irrelevant
      
      tags: v.optional(v.array(v.id("tags"))), // New tags field

      nextFollowUpDate: v.optional(v.number()),
      lastActivity: v.number(),

      // Special flags
      adminAssignmentRequired: v.optional(v.boolean()),
      isColdCallerLead: v.optional(v.boolean()),
      coldCallerAssignedAt: v.optional(v.number()),
      coldCallerAssignedTo: v.optional(v.id("users")),
      
      // Pharmavends specific fields
      pharmavendsUid: v.optional(v.string()),
      pharmavendsMetadata: v.optional(v.object({
        gstNo: v.string(),
        drugLicence: v.string(),
        receivedOn: v.string(),
        requirementType: v.string(),
        timeToCall: v.string(),
        profession: v.string(),
        experience: v.string(),
      })),
      
      // IndiaMART specific fields
      indiamartUniqueId: v.optional(v.string()),
      indiamartMetadata: v.optional(v.object({
        queryTime: v.string(),
        queryType: v.string(),
        mcatName: v.string(),
        productName: v.string(),
        countryIso: v.string(),
        callDuration: v.optional(v.string()),
      })),
      
      // Combined search field
      searchText: v.optional(v.string()),
    })
    .index("by_assigned_to", ["assignedTo"])
    .index("by_status", ["status"])
    .index("by_source", ["source"])
    .index("by_pharmavends_uid", ["pharmavendsUid"])
    .index("by_indiamart_unique_id", ["indiamartUniqueId"])
    .index("by_mobile", ["mobile"])
    .index("by_last_activity", ["lastActivity"])
    .index("by_cold_caller_assigned_to", ["coldCallerAssignedTo"])
    .index("by_is_cold_caller", ["isColdCallerLead"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["assignedTo"],
    })
    .searchIndex("search_all", {
      searchField: "searchText",
      filterFields: ["assignedTo"],
    }),

    tags: defineTable({
      name: v.string(),
      color: v.string(),
    })
    .index("by_name", ["name"])
    .index("by_color", ["color"]),

    comments: defineTable({
      leadId: v.id("leads"),
      userId: v.optional(v.id("users")),
      content: v.string(),
      isSystem: v.optional(v.boolean()),
    }).index("by_lead", ["leadId"]),

    followups: defineTable({
      leadId: v.id("leads"),
      assignedTo: v.optional(v.id("users")),
      scheduledAt: v.number(),
      completedAt: v.optional(v.number()),
      status: v.string(), // "pending", "completed", "rescheduled"
      completionStatus: v.optional(v.string()), // "timely", "overdue"
    })
    .index("by_lead", ["leadId"])
    .index("by_assigned_to", ["assignedTo"])
    .index("by_scheduled_at", ["scheduledAt"])
    .index("by_completed_at", ["completedAt"])
    .index("by_status", ["status"]),

    campaigns: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      type: v.string(), // "sequence", "broadcast"
      status: v.string(), // "draft", "active", "paused", "completed"
      createdBy: v.id("users"),
      
      // Lead selection criteria
      leadSelection: v.object({
        type: v.union(v.literal("all"), v.literal("filtered")),
        tagIds: v.optional(v.array(v.id("tags"))),
        statuses: v.optional(v.array(v.string())),
        sources: v.optional(v.array(v.string())),
        autoEnrollNew: v.optional(v.boolean()),
      }),
      
      // Campaign flow (blocks with IDs and connections)
      blocks: v.array(v.object({
        id: v.string(),
        type: v.string(),
        data: v.any(), // Block-specific data
        position: v.optional(v.object({ x: v.number(), y: v.number() })),
      })),
      
      connections: v.array(v.object({
        from: v.string(), // Block ID
        to: v.string(), // Block ID
        label: v.optional(v.string()), // For conditional branches
      })),
      
      metrics: v.optional(v.object({
        enrolled: v.number(),
        completed: v.number(),
        active: v.number(),
        sent: v.number(),
        opened: v.number(),
        clicked: v.number(),
        replied: v.number(),
      })),
    }).index("by_created_by", ["createdBy"]).index("by_status", ["status"]),

    // Campaign enrollments - tracks which leads are in which campaigns
    campaignEnrollments: defineTable({
      campaignId: v.id("campaigns"),
      leadId: v.id("leads"),
      status: v.string(), // "active", "completed", "failed", "paused"
      currentBlockId: v.optional(v.string()),
      enrolledAt: v.number(),
      completedAt: v.optional(v.number()),
      pathTaken: v.optional(v.array(v.string())), // Track which blocks were executed
    })
    .index("by_campaign", ["campaignId"])
    .index("by_lead", ["leadId"])
    .index("by_campaign_and_status", ["campaignId", "status"]),

    // Campaign execution queue
    campaignExecutions: defineTable({
      campaignId: v.id("campaigns"),
      enrollmentId: v.id("campaignEnrollments"),
      leadId: v.id("leads"),
      blockId: v.string(),
      scheduledFor: v.number(),
      status: v.string(), // "pending", "executing", "completed", "failed"
      executedAt: v.optional(v.number()),
      result: v.optional(v.any()),
      error: v.optional(v.string()),
    })
    .index("by_scheduled", ["scheduledFor"])
    .index("by_enrollment", ["enrollmentId"])
    .index("by_status", ["status"]),

    exportLogs: defineTable({
      userId: v.id("users"),
      downloadNumber: v.number(),
      fileName: v.string(),
      leadCount: v.number(),
      exportedAt: v.number(),
    }).index("by_user", ["userId"]),

    brevoApiKeys: defineTable({
      apiKey: v.string(),
      label: v.optional(v.string()),
      isActive: v.boolean(),
      dailyLimit: v.optional(v.number()),
      usageCount: v.number(),
      lastUsedAt: v.optional(v.number()),
      lastResetAt: v.number(),
      order: v.number(), // For rotation order
    }).index("by_active", ["isActive"]).index("by_order", ["order"]),

    emailTemplates: defineTable({
      name: v.string(),
      subject: v.string(),
      content: v.string(), // HTML content
      createdBy: v.id("users"),
      lastModifiedAt: v.number(),
    }).index("by_name", ["name"]),

    // WhatsApp Templates
    templates: defineTable({
      name: v.string(),
      language: v.string(), // e.g., "en_US"
      category: v.string(), // "MARKETING", "UTILITY", "AUTHENTICATION"
      status: v.string(), // "APPROVED", "PENDING", "REJECTED"
      externalId: v.optional(v.string()), // Meta template ID
      components: v.array(v.object({
        type: v.string(), // "HEADER", "BODY", "FOOTER", "BUTTONS"
        format: v.optional(v.string()), // "TEXT", "IMAGE", "VIDEO", "DOCUMENT"
        text: v.optional(v.string()),
        buttons: v.optional(v.array(v.object({
          type: v.string(), // "QUICK_REPLY", "URL", "PHONE_NUMBER"
          text: v.string(),
          url: v.optional(v.string()),
          phoneNumber: v.optional(v.string()),
        }))),
      })),
      lastSyncedAt: v.optional(v.number()),
    }).index("by_status", ["status"]),

    // For WhatsApp integration later
    chats: defineTable({
      leadId: v.id("leads"),
      platform: v.string(), // "whatsapp"
      externalId: v.string(), // WhatsApp phone number or chat ID
      lastMessageAt: v.number(),
      unreadCount: v.optional(v.number()),
    })
    .index("by_lead", ["leadId"])
    .index("by_last_message", ["lastMessageAt"]),

    messages: defineTable({
      chatId: v.id("chats"),
      direction: v.string(), // "inbound", "outbound"
      content: v.string(),
      status: v.string(), // "sent", "delivered", "read"
      messageType: v.optional(v.string()), // "text", "image", "file"
      mediaUrl: v.optional(v.string()), // URL for images/files
      mediaName: v.optional(v.string()), // Original filename
      mediaMimeType: v.optional(v.string()), // MIME type
      externalId: v.optional(v.string()), // WhatsApp message ID for status tracking
      quotedMessageId: v.optional(v.id("messages")), // ID of the message being replied to
    })
    .index("by_chat", ["chatId"])
    .index("by_chat_status", ["chatId", "status"])
    .index("by_external_id", ["externalId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;