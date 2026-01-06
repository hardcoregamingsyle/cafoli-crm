import { Toaster } from "@/components/ui/sonner";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import AppLayout from "@/components/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./index.css";
import "./types/global.d.ts";
import { setConvexApi } from "@/lib/convex-api";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Leads = lazy(() => import("./pages/Leads.tsx"));
const Campaigns = lazy(() => import("./pages/Campaigns.tsx"));
const CampaignBuilder = lazy(() => import("./pages/CampaignBuilderPage.tsx"));
const Reports = lazy(() => import("./pages/Reports.tsx"));
const WhatsApp = lazy(() => import("./pages/WhatsApp.tsx"));
const Emailing = lazy(() => import("./pages/Emailing.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Logs = lazy(() => import("./pages/Logs.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

// WORKAROUND: Fallback to hardcoded URL if env var is missing or empty
const convexUrl = import.meta.env.VITE_CONVEX_URL || "https://polished-marmot-96.convex.cloud";

console.log("Environment check:", {
  convexUrl,
  mode: import.meta.env.MODE,
  prod: import.meta.env.PROD,
});

if (!convexUrl || convexUrl === 'undefined' || convexUrl === '') {
  console.error("VITE_CONVEX_URL is not set or is empty. Value:", convexUrl);
  document.getElementById("root")!.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
      <div style="max-width: 500px; text-align: center;">
        <h1 style="color: #dc2626; margin-bottom: 16px;">Configuration Error</h1>
        <p style="color: #374151; margin-bottom: 24px;">
          The VITE_CONVEX_URL environment variable is not set. 
          Please configure it in your Cloudflare Pages dashboard.
        </p>
      </div>
    </div>
  `;
  throw new Error("VITE_CONVEX_URL is required");
}

const convex = new ConvexReactClient(convexUrl);

// Initialize the runtime API dynamically to avoid type instantiation issues
// Using string-based import to prevent TypeScript from analyzing at compile time
const apiPath = "@/convex/_generated/api";
import(/* @vite-ignore */ apiPath).then((module) => {
  setConvexApi(module.api);
}).catch((error) => {
  console.error("Failed to load Convex API:", error);
});

const router = createBrowserRouter([
  {
    errorElement: <ErrorBoundary />,
    children: [
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
        path: "/campaigns/new",
        element: <CampaignBuilder />,
      },
      {
        path: "/campaigns/edit/:campaignId",
        element: <CampaignBuilder />,
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
        path: "/emailing",
        element: <Emailing />,
      },
      {
        path: "/admin",
        element: <Admin />,
      },
      {
        path: "/logs",
        element: <Logs />,
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VlyToolbar />
    <InstrumentationProvider>
      <ConvexProvider client={convex}>
        <Suspense fallback={<RouteLoading />}>
          <RouterProvider router={router} />
        </Suspense>
        <Toaster />
      </ConvexProvider>
    </InstrumentationProvider>
  </StrictMode>,
);