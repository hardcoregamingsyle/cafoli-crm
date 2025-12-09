import { Toaster } from "@/components/ui/sonner";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import "./types/global.d.ts";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Leads = lazy(() => import("./pages/Leads.tsx"));
const Campaigns = lazy(() => import("./pages/Campaigns.tsx"));
const WhatsApp = lazy(() => import("./pages/WhatsApp.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

// WORKAROUND: Fallback to hardcoded URL if env var is missing or empty
// This fixes the issue where Cloudflare Pages build environment variables are sometimes empty
const convexUrl = import.meta.env.VITE_CONVEX_URL || "https://polished-marmot-96.convex.cloud";

// Debug logging to help troubleshoot
console.log("Environment check:", {
  convexUrl,
  convexUrlType: typeof convexUrl,
  convexUrlValue: JSON.stringify(convexUrl),
  allEnvVars: import.meta.env,
  mode: import.meta.env.MODE,
  prod: import.meta.env.PROD,
});

if (!convexUrl || convexUrl === 'undefined' || convexUrl === '') {
  console.error("VITE_CONVEX_URL is not set or is empty. Value:", convexUrl);
  console.error("Available env vars:", Object.keys(import.meta.env));
  console.error("Full env object:", import.meta.env);
  document.getElementById("root")!.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
      <div style="max-width: 500px; text-align: center;">
        <h1 style="color: #dc2626; margin-bottom: 16px;">Configuration Error</h1>
        <p style="color: #374151; margin-bottom: 24px;">
          The VITE_CONVEX_URL environment variable is not set. 
          Please configure it in your Cloudflare Pages dashboard.
        </p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: left;">
          <p style="font-weight: 600; margin-bottom: 8px;">To fix this:</p>
          <ol style="margin: 0; padding-left: 20px; color: #374151;">
            <li>Go to your Cloudflare Pages dashboard</li>
            <li>Navigate to Settings → Environment Variables</li>
            <li>Add VITE_CONVEX_URL with your Convex deployment URL</li>
            <li>Redeploy your application</li>
          </ol>
        </div>
      </div>
    </div>
  `;
  throw new Error("VITE_CONVEX_URL is required");
}

const convex = new ConvexReactClient(convexUrl);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VlyToolbar />
    <InstrumentationProvider>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
              
              {/* Protected Routes */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/all_leads" element={<Leads />} />
              <Route path="/my_leads" element={<Leads />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/whatsapp" element={<WhatsApp />} />
              <Route path="/admin" element={<Admin />} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </InstrumentationProvider>
  </StrictMode>,
);