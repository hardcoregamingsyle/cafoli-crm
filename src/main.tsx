import { Toaster } from "@/components/ui/sonner";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import AppLayout from "@/components/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./index.css";
import "./types/global.d.ts";

// Lazy load route components
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
const Catalog = lazy(() => import("./pages/Catalog.tsx"));

// Simple loading fallback
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

// Hardcoded Convex URL for Electron build
const convexUrl = "https://polished-marmot-96.convex.cloud";

const convex = new ConvexReactClient(convexUrl);

// FIX: Using HashRouter for Electron compatibility
const router = createHashRouter([
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
        path: "/catalog",
        element: <Catalog />,
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
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Suspense fallback={<RouteLoading />}>
            <RouterProvider router={router} />
          </Suspense>
          <Toaster />
        </ThemeProvider>
      </ConvexProvider>
    </InstrumentationProvider>
  </StrictMode>,
);