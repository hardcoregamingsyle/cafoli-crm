// Wrapper to avoid deep type instantiation errors
export function getConvexApi(): any {
  // Use type assertion to break the instantiation chain
  // The actual import happens at runtime, not compile time
  return (null as any);
}

// This will be populated at runtime by the app initialization
let runtimeApi: any = null;

export function setConvexApi(api: any) {
  runtimeApi = api;
}

export function getConvexApiRuntime() {
  return runtimeApi;
}