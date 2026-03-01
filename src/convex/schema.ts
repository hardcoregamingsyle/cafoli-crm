import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    role: v.optional(v.string()), // "admin", "staff", "uploader"
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),

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
  }).index("by_mobile", ["mobile"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_status", ["status"]),

  tags: defineTable({
    name: v.string(),
    color: v.string(),
  }),

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
      autoEnrollNew: v.boolean(),
    }),
    blocks: v.array(v.any()),
    connections: v.array(v.any()),
    createdAt: v.number(),
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
    .index("by_adminId", ["adminId"]),

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
  }).index("by_adminId", ["adminId"]),

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
  }).index("by_assignedTo_status", ["assignedTo", "status"]),

  productCategories: defineTable({
    name: v.string(),
  }),

  products: defineTable({
    name: v.string(),
    molecule: v.optional(v.string()),
    packaging: v.optional(v.string()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("productCategories")),
    mainImage: v.id("_storage"),
    images: v.array(v.id("_storage")),
    flyer: v.optional(v.id("_storage")),
    bridgeCard: v.optional(v.id("_storage")),
  }).index("by_categoryId", ["categoryId"]),

  whatsappTemplates: defineTable({
    name: v.string(),
    content: v.string(),
    category: v.string(),
    language: v.string(),
    status: v.string(),
  }),

  activityLogs: defineTable({
    userId: v.id("users"),
    action: v.string(),
    details: v.string(),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),

}, { schemaValidation: false });