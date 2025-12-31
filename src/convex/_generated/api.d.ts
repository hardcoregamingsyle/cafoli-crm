/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as auth_password from "../auth/password.js";
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
import type * as crons from "../crons.js";
import type * as emailActions from "../emailActions.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as http from "../http.js";
import type * as indiamartMutations from "../indiamartMutations.js";
import type * as leadQueries from "../leadQueries.js";
import type * as leadUtils from "../leadUtils.js";
import type * as leads from "../leads.js";
import type * as leads_admin from "../leads/admin.js";
import type * as leads_queries from "../leads/queries.js";
import type * as leads_standard from "../leads/standard.js";
import type * as lib_passwordUtils from "../lib/passwordUtils.js";
import type * as migrations from "../migrations.js";
import type * as pharmavends from "../pharmavends.js";
import type * as pharmavendsMutations from "../pharmavendsMutations.js";
import type * as reports from "../reports.js";
import type * as tags from "../tags.js";
import type * as users from "../users.js";
import type * as whatsapp from "../whatsapp.js";
import type * as whatsappMutations from "../whatsappMutations.js";
import type * as whatsappQueries from "../whatsappQueries.js";
import type * as whatsappStorage from "../whatsappStorage.js";
import type * as whatsappTemplates from "../whatsappTemplates.js";
import type * as whatsappTemplatesMutations from "../whatsappTemplatesMutations.js";
import type * as whatsappTemplatesQueries from "../whatsappTemplatesQueries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "auth/password": typeof auth_password;
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
  crons: typeof crons;
  emailActions: typeof emailActions;
  emailTemplates: typeof emailTemplates;
  http: typeof http;
  indiamartMutations: typeof indiamartMutations;
  leadQueries: typeof leadQueries;
  leadUtils: typeof leadUtils;
  leads: typeof leads;
  "leads/admin": typeof leads_admin;
  "leads/queries": typeof leads_queries;
  "leads/standard": typeof leads_standard;
  "lib/passwordUtils": typeof lib_passwordUtils;
  migrations: typeof migrations;
  pharmavends: typeof pharmavends;
  pharmavendsMutations: typeof pharmavendsMutations;
  reports: typeof reports;
  tags: typeof tags;
  users: typeof users;
  whatsapp: typeof whatsapp;
  whatsappMutations: typeof whatsappMutations;
  whatsappQueries: typeof whatsappQueries;
  whatsappStorage: typeof whatsappStorage;
  whatsappTemplates: typeof whatsappTemplates;
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
