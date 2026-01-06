// @ts-nocheck
import { api } from "@/convex/_generated/api";

export function getConvexApiRuntime(): any {
  return api;
}

// Backward compatibility - same as getConvexApiRuntime
export function getConvexApi(): any {
  return getConvexApiRuntime();
}
