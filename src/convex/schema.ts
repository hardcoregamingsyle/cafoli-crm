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
    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      role: v.optional(roleValidator),
      passwordHash: v.optional(v.string()),
      
      preferences: v.optional(v.object({
        leadRemindersEnabled: v.optional(v.boolean()),
      })),
    }).index("email", ["email"]),

    leads: defineTable({
      name: v.string(),
      subject: v.string(),
      source: v.string(),
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
      status: v.optional(v.string()),
      type: v.optional(v.string()),
      
      tags: v.optional(v.array(v.id("tags"))),

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
      status: v.string(),
      completionStatus: v.optional(v.string()),
    })
    .index("by_lead", ["leadId"])
    .index("by_assigned_to", ["assignedTo"])
    .index("by_scheduled_at", ["scheduledAt"])
    .index("by_completed_at", ["completedAt"])
    .index("by_status", ["status"]),

    campaigns: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      type: v.string(),
      status: v.string(),
      createdBy: v.id("users"),
      
      leadSelection: v.object({
        type: v.union(v.literal("all"), v.literal("filtered")),
        tagIds: v.optional(v.array(v.id("tags"))),
        statuses: v.optional(v.array(v.string())),
        sources: v.optional(v.array(v.string())),
        autoEnrollNew: v.optional(v.boolean()),
      }),
      
      blocks: v.array(v.object({
        id: v.string(),
        type: v.string(),
        data: v.any(),
        position: v.optional(v.object({ x: v.number(), y: v.number() })),
      })),
      
      connections: v.array(v.object({
        from: v.string(),
        to: v.string(),
        label: v.optional(v.string()),
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

    campaignEnrollments: defineTable({
      campaignId: v.id("campaigns"),
      leadId: v.id("leads"),
      status: v.string(),
      currentBlockId: v.optional(v.string()),
      enrolledAt: v.number(),
      completedAt: v.optional(v.number()),
      pathTaken: v.optional(v.array(v.string())),
    })
    .index("by_campaign", ["campaignId"])
    .index("by_lead", ["leadId"])
    .index("by_campaign_and_status", ["campaignId", "status"]),

    campaignExecutions: defineTable({
      campaignId: v.id("campaigns"),
      enrollmentId: v.id("campaignEnrollments"),
      leadId: v.id("leads"),
      blockId: v.string(),
      scheduledFor: v.number(),
      status: v.string(),
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
      order: v.number(),
    }).index("by_active", ["isActive"]).index("by_order", ["order"]),

    geminiApiKeys: defineTable({
      apiKey: v.string(),
      label: v.optional(v.string()),
      isActive: v.boolean(),
      dailyLimit: v.optional(v.number()),
      usageCount: v.number(),
      lastUsedAt: v.optional(v.number()),
      lastResetAt: v.number(),
    }).index("by_active", ["isActive"]),

    emailTemplates: defineTable({
      name: v.string(),
      subject: v.string(),
      content: v.string(),
      createdBy: v.id("users"),
      lastModifiedAt: v.number(),
    }).index("by_name", ["name"]),

    templates: defineTable({
      name: v.string(),
      language: v.string(),
      category: v.string(),
      status: v.string(),
      externalId: v.optional(v.string()),
      components: v.array(v.object({
        type: v.string(),
        format: v.optional(v.string()),
        text: v.optional(v.string()),
        buttons: v.optional(v.array(v.object({
          type: v.string(),
          text: v.string(),
          url: v.optional(v.string()),
          phoneNumber: v.optional(v.string()),
        }))),
      })),
      lastSyncedAt: v.optional(v.number()),
    }).index("by_status", ["status"]),

    chats: defineTable({
      leadId: v.id("leads"),
      platform: v.string(),
      externalId: v.string(),
      lastMessageAt: v.number(),
      unreadCount: v.optional(v.number()),
    })
    .index("by_lead", ["leadId"])
    .index("by_last_message", ["lastMessageAt"]),

    messages: defineTable({
      chatId: v.id("chats"),
      direction: v.string(),
      content: v.string(),
      status: v.string(),
      messageType: v.optional(v.string()),
      mediaUrl: v.optional(v.string()),
      mediaName: v.optional(v.string()),
      mediaMimeType: v.optional(v.string()),
      externalId: v.optional(v.string()),
      quotedMessageId: v.optional(v.id("messages")),
    })
    .index("by_chat", ["chatId"])
    .index("by_chat_status", ["chatId", "status"])
    .index("by_external_id", ["externalId"]),

    aiSuggestions: defineTable({
      leadId: v.optional(v.id("leads")),
      userId: v.id("users"),
      type: v.string(), // "chat_reply", "follow_up", "lead_analysis"
      content: v.string(),
      originalContent: v.optional(v.string()), // For rewrites
      status: v.string(), // "generated", "used", "discarded"
      metadata: v.optional(v.any()),
    })
    .index("by_lead", ["leadId"])
    .index("by_user", ["userId"])
    .index("by_type", ["type"]),

    activityLogs: defineTable({
      userId: v.optional(v.id("users")),
      category: v.string(),
      action: v.string(),
      details: v.optional(v.string()),
      metadata: v.optional(v.any()),
      leadId: v.optional(v.id("leads")),
      ipAddress: v.optional(v.string()),
      timestamp: v.number(),
    })
    .index("by_timestamp", ["timestamp"])
    .index("by_category", ["category"])
    .index("by_user", ["userId"])
    .index("by_lead", ["leadId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;