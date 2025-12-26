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
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as auth_password from "../auth/password.js";
import type * as brevo from "../brevo.js";
import type * as campaigns from "../campaigns.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as indiamartMutations from "../indiamartMutations.js";
import type * as leads from "../leads.js";
import type * as lib_passwordUtils from "../lib/passwordUtils.js";
import type * as migrations from "../migrations.js";
import type * as pharmavends from "../pharmavends.js";
import type * as pharmavendsMutations from "../pharmavendsMutations.js";
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
  "auth/emailOtp": typeof auth_emailOtp;
  "auth/password": typeof auth_password;
  brevo: typeof brevo;
  campaigns: typeof campaigns;
  crons: typeof crons;
  http: typeof http;
  indiamartMutations: typeof indiamartMutations;
  leads: typeof leads;
  "lib/passwordUtils": typeof lib_passwordUtils;
  migrations: typeof migrations;
  pharmavends: typeof pharmavends;
  pharmavendsMutations: typeof pharmavendsMutations;
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
