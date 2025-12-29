import { Toaster } from "@/components/ui/sonner";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Route, Routes } from "react-router";
import AppLayout from "@/components/AppLayout";
import "./index.css";
import "./types/global.d.ts";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Leads = lazy(() => import("./pages/Leads.tsx"));
const Campaigns = lazy(() => import("./pages/Campaigns.tsx"));
const Reports = lazy(() => import("./pages/Reports.tsx"));
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

const router = createBrowserRouter([
  {
    path: "/",
    element: <Landing />,
  },
  {
    path: "/auth",
    element: <AuthPage redirectAfterAuth="/dashboard" />,
  },
  {
    path: "/dashboard",
    element: <Dashboard />,
  },
  {
    path: "/leads",
    element: <Leads />,
  },
  {
    path: "/all_leads",
    element: <Leads />,
  },
  {
    path: "/my_leads",
    element: <Leads />,
  },
  {
    path: "/campaigns",
    element: <Campaigns />,
  },
  {
    path: "/reports",
    element: <Reports />,
  },
  {
    path: "/whatsapp",
    element: <WhatsApp />,
  },
  {
    path: "/admin",
    element: <Admin />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VlyToolbar />
    <InstrumentationProvider>
      <ConvexAuthProvider client={convex}>
        <RouterProvider router={router} />
        <Toaster />
      </ConvexAuthProvider>
    </InstrumentationProvider>
  </StrictMode>,
);