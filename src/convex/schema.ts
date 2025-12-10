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
      
      nextFollowUpDate: v.optional(v.number()),
      lastActivity: v.number(),
      
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
    })
    .index("by_assigned_to", ["assignedTo"])
    .index("by_status", ["status"])
    .index("by_source", ["source"])
    .index("by_pharmavends_uid", ["pharmavendsUid"])
    .index("by_indiamart_unique_id", ["indiamartUniqueId"]),

    comments: defineTable({
      leadId: v.id("leads"),
      userId: v.id("users"),
      content: v.string(),
    }).index("by_lead", ["leadId"]),

    campaigns: defineTable({
      name: v.string(),
      type: v.string(), // Email, WhatsApp, etc.
      status: v.string(), // Draft, Active, Completed
      metrics: v.optional(v.object({
        sent: v.number(),
        opened: v.number(),
        clicked: v.number(),
      })),
    }),

    // For WhatsApp integration later
    chats: defineTable({
      leadId: v.id("leads"),
      platform: v.string(), // "whatsapp"
      externalId: v.string(), // WhatsApp phone number or chat ID
      lastMessageAt: v.number(),
    }).index("by_lead", ["leadId"]),

    messages: defineTable({
      chatId: v.id("chats"),
      direction: v.string(), // "inbound", "outbound"
      content: v.string(),
      status: v.string(), // "sent", "delivered", "read"
    }).index("by_chat", ["chatId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;