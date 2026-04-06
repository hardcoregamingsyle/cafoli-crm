import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const ROLES = {
  ADMIN: "admin",
  STAFF: "staff",
  UPLOADER: "uploader",
} as const;

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    role: v.optional(v.string()), // "admin", "staff", "uploader"
    tokenIdentifier: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    preferences: v.optional(v.any()),
    lastActivity: v.optional(v.number()),
  }).index("by_token", ["tokenIdentifier"])
    .index("email", ["email"]),

  leads: defineTable({
    name: v.string(),
    subject: v.optional(v.string()),
    source: v.optional(v.string()),
    mobile: v.string(),
    altMobile: v.optional(v.string()),
    email: v.optional(v.string()),
    altEmail: v.optional(v.string()),
    agencyName: v.optional(v.string()),
    pincode: v.optional(v.string()),
    state: v.optional(v.string()),
    district: v.optional(v.string()),
    station: v.optional(v.string()),
    message: v.optional(v.string()),
    status: v.string(), // "Cold", "Hot", "Mature"
    type: v.optional(v.string()), // "Relevant", "Irrelevant", "To be Decided"
    assignedTo: v.optional(v.id("users")),
    assignedToName: v.optional(v.string()),
    nextFollowUpDate: v.optional(v.number()),
    lastActivity: v.number(),
    pharmavendsUid: v.optional(v.string()),
    indiamartUniqueId: v.optional(v.string()),
    priorityScore: v.optional(v.number()),
    tags: v.optional(v.array(v.id("tags"))),
    aiScore: v.optional(v.number()),
    aiScoreTier: v.optional(v.string()),
    aiScoreRationale: v.optional(v.string()),
    aiScoredAt: v.optional(v.number()),
    adminAssignmentRequired: v.optional(v.boolean()),
    isColdCallerLead: v.optional(v.boolean()),
    isBulkLead: v.optional(v.boolean()),
    coldCallerAssignedTo: v.optional(v.id("users")),
    coldCallerAssignedAt: v.optional(v.number()),
    indiamartMetadata: v.optional(v.any()),
    searchText: v.optional(v.string()),
    welcomeEmailSent: v.optional(v.boolean()),
  }).index("by_mobile", ["mobile"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_status", ["status"])
    .index("by_is_cold_caller", ["isColdCallerLead"])
    .index("by_cold_caller_assigned_to", ["coldCallerAssignedTo"])
    .index("by_last_activity", ["lastActivity"])
    .index("by_assigned_to_and_last_activity", ["assignedTo", "lastActivity"])
    .index("by_source", ["source"])
    .index("by_source_and_last_activity", ["source", "lastActivity"])
    .index("by_indiamart_id", ["indiamartUniqueId"])
    .searchIndex("search_all", {
      searchField: "searchText",
      filterFields: ["assignedTo", "status"],
    }),

  tags: defineTable({
    name: v.string(),
    color: v.string(),
  }).index("by_name", ["name"])
    .index("by_color", ["color"]),

  campaigns: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.string(), // "sequence"
    status: v.string(), // "active", "paused", "completed"
    leadSelection: v.object({
      type: v.string(), // "all", "filtered"
      tagIds: v.optional(v.array(v.id("tags"))),
      statuses: v.optional(v.array(v.string())),
      sources: v.optional(v.array(v.string())),
      autoEnrollNew: v.optional(v.boolean()),
    }),
    blocks: v.array(v.any()),
    connections: v.array(v.any()),
    createdAt: v.number(),
    metrics: v.optional(v.any()),
  }).index("by_userId", ["userId"]),

  bulkContacts: defineTable({
    adminId: v.id("users"),
    phoneNumber: v.string(),
    name: v.optional(v.string()),
    templateId: v.string(),
    metadata: v.optional(v.any()),
    status: v.string(), // "sent", "replied", "cold"
    sentAt: v.number(),
    lastInteractionAt: v.optional(v.number()),
  }).index("by_sentAt", ["sentAt"])
    .index("by_phoneNumber", ["phoneNumber"])
    .index("by_adminId", ["adminId"])
    .index("by_status", ["status"]),

  coldCallerLeads: defineTable({
    name: v.string(),
    mobile: v.string(),
    source: v.optional(v.string()),
    status: v.string(),
    lastActivity: v.number(),
    originalContactId: v.optional(v.id("bulkContacts")),
    assignedTo: v.optional(v.id("users")),
    nextFollowUpDate: v.optional(v.number()),
    type: v.optional(v.string()),
  }).index("by_mobile", ["mobile"])
    .index("by_assignedTo", ["assignedTo"]),

  brevoApiKeys: defineTable({
    adminId: v.id("users"),
    apiKey: v.string(),
    label: v.optional(v.string()),
    dailyLimit: v.number(),
    usageCount: v.number(),
    lastUsedAt: v.number(),
    isActive: v.boolean(),
    lastResetAt: v.optional(v.number()),
    order: v.optional(v.number()),
  }).index("by_adminId", ["adminId"])
    .index("by_order", ["order"])
    .index("by_active", ["isActive"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
    deviceType: v.optional(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.number(),
  }).index("by_userId", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  contactRequests: defineTable({
    leadId: v.id("leads"),
    assignedTo: v.id("users"),
    customerMessage: v.string(),
    status: v.string(), // "pending", "acknowledged"
    createdAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
  }).index("by_assignedTo_status", ["assignedTo", "status"]),

  productCategories: defineTable({
    name: v.string(),
  }).index("by_name", ["name"]),

  products: defineTable({
    name: v.string(),
    brandName: v.optional(v.string()),
    molecule: v.optional(v.string()),
    mrp: v.optional(v.string()),
    packaging: v.optional(v.string()),
    images: v.optional(v.array(v.id("_storage"))),
    mainImage: v.optional(v.id("_storage")),
    flyer: v.optional(v.id("_storage")),
    bridgeCard: v.optional(v.id("_storage")),
    visualaid: v.optional(v.id("_storage")),
    description: v.optional(v.string()),
    pageLink: v.optional(v.string()),
    videoLink: v.optional(v.string()),
    categoryId: v.optional(v.id("productCategories")),
    categories: v.optional(v.array(v.id("productCategories"))),
    externalImageUrl: v.optional(v.string()),
    externalPdfUrl: v.optional(v.string()),
  }).index("by_name", ["name"]),

  cafoliWebProducts: defineTable({
    brandName: v.string(),
    composition: v.optional(v.string()),
    dosageForm: v.optional(v.string()),
    pageUrl: v.string(),
    imageUrl: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),
    pdfUrl: v.optional(v.string()),
    literaturePdfUrl: v.optional(v.string()),
    mrp: v.optional(v.string()),
    packaging: v.optional(v.string()),
    packagingType: v.optional(v.string()),
    description: v.optional(v.string()),
    scrapedAt: v.number(),
  }).index("by_brandName", ["brandName"])
    .index("by_pageUrl", ["pageUrl"]),

  whatsappTemplates: defineTable({
    name: v.string(),
    content: v.string(),
    category: v.string(),
    language: v.string(),
    status: v.string(),
    externalId: v.optional(v.string()),
  }),

  templates: defineTable({
     name: v.string(),
     content: v.optional(v.string()),
     category: v.optional(v.string()),
     language: v.optional(v.string()),
     status: v.optional(v.string()),
     externalId: v.optional(v.string()),
     components: v.optional(v.array(v.any())),
     lastSyncedAt: v.optional(v.number()),
  }),

  activityLogs: defineTable({
    userId: v.optional(v.id("users")),
    action: v.string(),
    details: v.string(),
    timestamp: v.number(),
    leadId: v.optional(v.id("leads")),
    category: v.optional(v.string()),
    metadata: v.optional(v.any()),
  }).index("by_timestamp", ["timestamp"])
    .index("by_category", ["category"])
    .index("by_user", ["userId"])
    .index("by_lead", ["leadId"]),

  geminiApiKeys: defineTable({
    apiKey: v.string(),
    label: v.optional(v.string()),
    isActive: v.boolean(),
    usageCount: v.optional(v.number()),
    lastResetAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
  }).index("by_active", ["isActive"]),

  activeChatSessions: defineTable({
    leadId: v.id("leads"),
    userId: v.id("users"),
    lastActivity: v.number(),
  }).index("by_leadId", ["leadId"]),

  chats: defineTable({
    leadId: v.id("leads"),
    unreadCount: v.optional(v.number()),
    lastMessageAt: v.optional(v.number()),
    platform: v.optional(v.string()),
  }).index("by_lead", ["leadId"]),

  messages: defineTable({
    chatId: v.id("chats"),
    direction: v.string(),
    content: v.string(),
    messageType: v.string(),
    externalId: v.optional(v.string()),
    status: v.optional(v.string()),
    mediaId: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    mediaName: v.optional(v.string()),
    mediaMimeType: v.optional(v.string()),
    templateName: v.optional(v.string()),
    templateButtons: v.optional(v.array(v.object({
      type: v.string(),
      text: v.string(),
      url: v.optional(v.string()),
      phoneNumber: v.optional(v.string()),
    }))),
    quotedMessageId: v.optional(v.id("messages")),
  }).index("by_chat", ["chatId"])
    .index("by_external_id", ["externalId"])
    .index("by_chat_status", ["chatId", "status"]),

  comments: defineTable({
    leadId: v.id("leads"),
    userId: v.optional(v.id("users")),
    content: v.string(),
    isSystem: v.optional(v.boolean()),
  }).index("by_lead", ["leadId"]),

  leadSummaries: defineTable({
    leadId: v.id("leads"),
    summary: v.string(),
    lastActivityHash: v.optional(v.string()),
    generatedAt: v.optional(v.number()),
  }).index("by_lead", ["leadId"])
    .index("by_lead_and_hash", ["leadId", "lastActivityHash"]),

  batchProcessControl: defineTable({
    processId: v.string(),
    shouldStop: v.optional(v.boolean()),
    processed: v.optional(v.number()),
    failed: v.optional(v.number()),
    status: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
    total: v.optional(v.number()),
  }).index("by_process_id", ["processId"]),

  interventionRequests: defineTable({
    leadId: v.id("leads"),
    assignedTo: v.optional(v.id("users")),
    requestedProduct: v.optional(v.string()),
    customerMessage: v.optional(v.string()),
    aiDraftedMessage: v.optional(v.string()),
    status: v.string(),
    claimedBy: v.optional(v.id("users")),
    claimedAt: v.optional(v.number()),
    requiresFollowUp: v.optional(v.boolean()),
    resolvedAt: v.optional(v.number()),
  }).index("by_status", ["status"])
    .index("by_claimed_by", ["claimedBy"]),

  rangePdfs: defineTable({
    name: v.string(),
    storageId: v.id("_storage"),
    division: v.optional(v.string()),
  }),

  whatsappConfig: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  whatsappGroups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    createdBy: v.id("users"),
    groupId: v.optional(v.string()),
    inviteLink: v.optional(v.string()),
    participantPhoneNumbers: v.optional(v.array(v.string())),
  }).index("by_created_by", ["createdBy"]),

  whatsappMediaCache: defineTable({
    storageId: v.id("_storage"),
    mediaId: v.string(),
    mimeType: v.optional(v.string()),
    displayUrl: v.optional(v.string()),
  }).index("by_storageId", ["storageId"]),

  emailTemplates: defineTable({
    name: v.string(),
    subject: v.string(),
    content: v.string(),
    createdBy: v.optional(v.id("users")),
    lastModifiedAt: v.optional(v.number()),
  }),

  quickReplies: defineTable({
    userId: v.optional(v.id("users")),
    title: v.string(),
    content: v.string(),
    usageCount: v.optional(v.number()),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
  }),

  exportLogs: defineTable({
    userId: v.id("users"),
    downloadNumber: v.number(),
    fileName: v.string(),
    leadCount: v.number(),
    timestamp: v.number(),
    exportedAt: v.optional(v.number()),
  }),

  emailEnrollments: defineTable({
    leadId: v.id("leads"),
    campaignId: v.id("campaigns"),
    status: v.string(),
  }),

  campaignEnrollments: defineTable({
    leadId: v.id("leads"),
    campaignId: v.id("campaigns"),
    status: v.string(),
    currentBlockId: v.optional(v.string()),
    enrolledAt: v.optional(v.number()),
    pathTaken: v.optional(v.array(v.string())),
  }).index("by_campaign", ["campaignId"]),

  campaignExecutions: defineTable({
    campaignId: v.id("campaigns"),
    enrollmentId: v.id("campaignEnrollments"),
    leadId: v.id("leads"),
    blockId: v.string(),
    status: v.string(),
    scheduledFor: v.number(),
    executedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    result: v.optional(v.any()),
  }).index("by_status", ["status"]),

  followups: defineTable({
    leadId: v.id("leads"),
    userId: v.id("users"),
    assignedTo: v.optional(v.id("users")),
    scheduledAt: v.number(),
    status: v.string(), // "pending", "completed", "overdue"
    completionStatus: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  }).index("by_lead", ["leadId"])
    .index("by_user", ["userId"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_scheduled_at", ["scheduledAt"]),

  r2_leads_mock: defineTable({
    originalId: v.string(),
    leadData: v.any(),
    mobile: v.optional(v.string()),
    indiamartUniqueId: v.optional(v.string()),
    name: v.optional(v.string()),
    searchText: v.optional(v.string()),
    status: v.optional(v.string()),
    source: v.optional(v.string()),
  }).index("by_mobile", ["mobile"])
    .index("by_indiamart_id", ["indiamartUniqueId"])
    .index("by_original_id", ["originalId"])
    .index("by_source", ["source"])
    .searchIndex("search_all", {
      searchField: "searchText",
    }),

  // Singleton cache for unique lead sources — avoids scanning 5000 leads on every query
  leadSourcesCache: defineTable({
    key: v.string(), // always "singleton"
    sources: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

}, { schemaValidation: false });