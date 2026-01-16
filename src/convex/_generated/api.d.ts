/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activeChatSessions from "../activeChatSessions.js";
import type * as activityLogs from "../activityLogs.js";
import type * as ai from "../ai.js";
import type * as aiBackground from "../aiBackground.js";
import type * as aiBackgroundHelpers from "../aiBackgroundHelpers.js";
import type * as aiMutations from "../aiMutations.js";
import type * as auth from "../auth.js";
import type * as authProviders from "../authProviders.js";
import type * as brevo from "../brevo.js";
import type * as brevoMutations from "../brevoMutations.js";
import type * as brevoQueries from "../brevoQueries.js";
import type * as campaignExecutor from "../campaignExecutor.js";
import type * as campaignExecutorMutations from "../campaignExecutorMutations.js";
import type * as campaignMutations from "../campaignMutations.js";
import type * as campaignQueries from "../campaignQueries.js";
import type * as campaignSchema from "../campaignSchema.js";
import type * as campaigns from "../campaigns.js";
import type * as coldCallerLeads from "../coldCallerLeads.js";
import type * as contactRequests from "../contactRequests.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as emailActions from "../emailActions.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as geminiMutations from "../geminiMutations.js";
import type * as get_user from "../get_user.js";
import type * as http from "../http.js";
import type * as indiamartMutations from "../indiamartMutations.js";
import type * as interventionRequests from "../interventionRequests.js";
import type * as leadQueries from "../leadQueries.js";
import type * as leadUtils from "../leadUtils.js";
import type * as leads_admin from "../leads/admin.js";
import type * as leads_autoAssign from "../leads/autoAssign.js";
import type * as leads_deduplication from "../leads/deduplication.js";
import type * as leads_mutations from "../leads/mutations.js";
import type * as leads_queries from "../leads/queries.js";
import type * as leads_queries_basic from "../leads/queries/basic.js";
import type * as leads_queries_comments from "../leads/queries/comments.js";
import type * as leads_queries_followups from "../leads/queries/followups.js";
import type * as leads_queries_helpers from "../leads/queries/helpers.js";
import type * as leads_queries_index from "../leads/queries/index.js";
import type * as leads_queries_meta from "../leads/queries/meta.js";
import type * as leads_queries_overdue from "../leads/queries/overdue.js";
import type * as leads_queries_pagination from "../leads/queries/pagination.js";
import type * as leads_standard from "../leads/standard.js";
import type * as lib_gemini from "../lib/gemini.js";
import type * as lib_passwordUtils from "../lib/passwordUtils.js";
import type * as migrations from "../migrations.js";
import type * as migrations_fixProductStorageMetadata from "../migrations/fixProductStorageMetadata.js";
import type * as migrations_updateProductsSchema from "../migrations/updateProductsSchema.js";
import type * as pharmavends from "../pharmavends.js";
import type * as pharmavendsMutations from "../pharmavendsMutations.js";
import type * as products from "../products.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as pushNotificationsActions from "../pushNotificationsActions.js";
import type * as quickReplies from "../quickReplies.js";
import type * as rangePdfs from "../rangePdfs.js";
import type * as reportPdfGenerator from "../reportPdfGenerator.js";
import type * as reports from "../reports.js";
import type * as tags from "../tags.js";
import type * as test_utils from "../test_utils.js";
import type * as users from "../users.js";
import type * as whatsapp from "../whatsapp.js";
import type * as whatsapp_cloudflare from "../whatsapp/cloudflare.js";
import type * as whatsapp_config from "../whatsapp/config.js";
import type * as whatsapp_internal from "../whatsapp/internal.js";
import type * as whatsapp_mediaCache from "../whatsapp/mediaCache.js";
import type * as whatsapp_messages from "../whatsapp/messages.js";
import type * as whatsapp_status from "../whatsapp/status.js";
import type * as whatsapp_webhook from "../whatsapp/webhook.js";
import type * as whatsappAi from "../whatsappAi.js";
import type * as whatsappBulk from "../whatsappBulk.js";
import type * as whatsappConfig from "../whatsappConfig.js";
import type * as whatsappGroups from "../whatsappGroups.js";
import type * as whatsappGroupsMutations from "../whatsappGroupsMutations.js";
import type * as whatsappGroupsQueries from "../whatsappGroupsQueries.js";
import type * as whatsappMutations from "../whatsappMutations.js";
import type * as whatsappQueries from "../whatsappQueries.js";
import type * as whatsappStorage from "../whatsappStorage.js";
import type * as whatsappTemplates from "../whatsappTemplates.js";
import type * as whatsappTemplatesActions from "../whatsappTemplatesActions.js";
import type * as whatsappTemplatesMutations from "../whatsappTemplatesMutations.js";
import type * as whatsappTemplatesQueries from "../whatsappTemplatesQueries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activeChatSessions: typeof activeChatSessions;
  activityLogs: typeof activityLogs;
  ai: typeof ai;
  aiBackground: typeof aiBackground;
  aiBackgroundHelpers: typeof aiBackgroundHelpers;
  aiMutations: typeof aiMutations;
  auth: typeof auth;
  authProviders: typeof authProviders;
  brevo: typeof brevo;
  brevoMutations: typeof brevoMutations;
  brevoQueries: typeof brevoQueries;
  campaignExecutor: typeof campaignExecutor;
  campaignExecutorMutations: typeof campaignExecutorMutations;
  campaignMutations: typeof campaignMutations;
  campaignQueries: typeof campaignQueries;
  campaignSchema: typeof campaignSchema;
  campaigns: typeof campaigns;
  coldCallerLeads: typeof coldCallerLeads;
  contactRequests: typeof contactRequests;
  crons: typeof crons;
  debug: typeof debug;
  emailActions: typeof emailActions;
  emailTemplates: typeof emailTemplates;
  geminiMutations: typeof geminiMutations;
  get_user: typeof get_user;
  http: typeof http;
  indiamartMutations: typeof indiamartMutations;
  interventionRequests: typeof interventionRequests;
  leadQueries: typeof leadQueries;
  leadUtils: typeof leadUtils;
  "leads/admin": typeof leads_admin;
  "leads/autoAssign": typeof leads_autoAssign;
  "leads/deduplication": typeof leads_deduplication;
  "leads/mutations": typeof leads_mutations;
  "leads/queries": typeof leads_queries;
  "leads/queries/basic": typeof leads_queries_basic;
  "leads/queries/comments": typeof leads_queries_comments;
  "leads/queries/followups": typeof leads_queries_followups;
  "leads/queries/helpers": typeof leads_queries_helpers;
  "leads/queries/index": typeof leads_queries_index;
  "leads/queries/meta": typeof leads_queries_meta;
  "leads/queries/overdue": typeof leads_queries_overdue;
  "leads/queries/pagination": typeof leads_queries_pagination;
  "leads/standard": typeof leads_standard;
  "lib/gemini": typeof lib_gemini;
  "lib/passwordUtils": typeof lib_passwordUtils;
  migrations: typeof migrations;
  "migrations/fixProductStorageMetadata": typeof migrations_fixProductStorageMetadata;
  "migrations/updateProductsSchema": typeof migrations_updateProductsSchema;
  pharmavends: typeof pharmavends;
  pharmavendsMutations: typeof pharmavendsMutations;
  products: typeof products;
  pushNotifications: typeof pushNotifications;
  pushNotificationsActions: typeof pushNotificationsActions;
  quickReplies: typeof quickReplies;
  rangePdfs: typeof rangePdfs;
  reportPdfGenerator: typeof reportPdfGenerator;
  reports: typeof reports;
  tags: typeof tags;
  test_utils: typeof test_utils;
  users: typeof users;
  whatsapp: typeof whatsapp;
  "whatsapp/cloudflare": typeof whatsapp_cloudflare;
  "whatsapp/config": typeof whatsapp_config;
  "whatsapp/internal": typeof whatsapp_internal;
  "whatsapp/mediaCache": typeof whatsapp_mediaCache;
  "whatsapp/messages": typeof whatsapp_messages;
  "whatsapp/status": typeof whatsapp_status;
  "whatsapp/webhook": typeof whatsapp_webhook;
  whatsappAi: typeof whatsappAi;
  whatsappBulk: typeof whatsappBulk;
  whatsappConfig: typeof whatsappConfig;
  whatsappGroups: typeof whatsappGroups;
  whatsappGroupsMutations: typeof whatsappGroupsMutations;
  whatsappGroupsQueries: typeof whatsappGroupsQueries;
  whatsappMutations: typeof whatsappMutations;
  whatsappQueries: typeof whatsappQueries;
  whatsappStorage: typeof whatsappStorage;
  whatsappTemplates: typeof whatsappTemplates;
  whatsappTemplatesActions: typeof whatsappTemplatesActions;
  whatsappTemplatesMutations: typeof whatsappTemplatesMutations;
  whatsappTemplatesQueries: typeof whatsappTemplatesQueries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
