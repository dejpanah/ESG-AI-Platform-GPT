import { Toaster } from "@/components/ui/sonner";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const KnowledgeOS = lazy(() => import("./pages/KnowledgeOS.tsx"));
const DocumentsPage = lazy(() => import("./pages/Documents.tsx"));
const ReportsPage = lazy(() => import("./pages/Reports.tsx"));
const EsgDataPage = lazy(() => import("./pages/EsgData.tsx"));
const CollectionsPage = lazy(() => import("./pages/Collections.tsx"));
const SyncQueuePage = lazy(() => import("./pages/SyncQueue.tsx"));
const ActivityPage = lazy(() => import("./pages/Activity.tsx"));
const PerformancePage = lazy(() => import("./pages/Performance.tsx"));
const BackendHealthPage = lazy(() => import("./pages/BackendHealth.tsx"));
const EvaluationsPage = lazy(() => import("./pages/Evaluations.tsx"));
const ModelsPage = lazy(() => import("./pages/Models.tsx"));
const IndexesPage = lazy(() => import("./pages/Indexes.tsx"));
const SettingsPage = lazy(() => import("./pages/Settings.tsx"));
const StoragePage = lazy(() => import("./pages/Storage.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Scope1CalcPage = lazy(() => import("./pages/calc/Scope1Page.tsx"));
const Scope2CalcPage = lazy(() => import("./pages/calc/Scope2Page.tsx"));
const Scope3CalcPage = lazy(() => import("./pages/calc/Scope3Page.tsx"));
const EmissionFactorsCalcPage = lazy(() => import("./pages/calc/EmissionFactorsPage.tsx"));
const MethaneCalcPage = lazy(() => import("./pages/calc/MethanePage.tsx"));
const FlaringCalcPage = lazy(() => import("./pages/calc/FlaringPage.tsx"));
const CarbonIntensityCalcPage = lazy(() => import("./pages/calc/CarbonIntensityPage.tsx"));
const WaterCalcPage = lazy(() => import("./pages/calc/WaterPage.tsx"));
const WasteCalcPage = lazy(() => import("./pages/calc/WastePage.tsx"));
const AirEmissionsCalcPage = lazy(() => import("./pages/calc/AirEmissionsPage.tsx"));
const SafetyHseCalcPage = lazy(() => import("./pages/calc/SafetyHsePage.tsx"));
const SocialCapitalCalcPage = lazy(() => import("./pages/calc/SocialCapitalPage.tsx"));
const GovernanceCalcPage = lazy(() => import("./pages/calc/GovernancePage.tsx"));
const FormulaEngineCalcPage = lazy(() => import("./pages/calc/FormulaEnginePage.tsx"));
const DoubleMaterialityPage = lazy(() => import("./pages/materiality/DoubleMaterialityPage.tsx"));
const StakeholderSurveyPage = lazy(() => import("./pages/materiality/StakeholderSurveyPage.tsx"));
const TopicStandardMappingPage = lazy(() => import("./pages/materiality/TopicStandardMappingPage.tsx"));
const PeriodicReviewPage = lazy(() => import("./pages/materiality/PeriodicReviewPage.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <RootErrorBoundary>
      <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<KnowledgeOS />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/esg-data" element={<EsgDataPage />} />
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/sync" element={<SyncQueuePage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/performance" element={<PerformancePage />} />
              <Route path="/backend-health" element={<BackendHealthPage />} />
              <Route path="/evaluations" element={<EvaluationsPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/indexes" element={<IndexesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/storage" element={<StoragePage />} />
              <Route
                path="/auth"
                element={<AuthPage />}
              />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/calc/scope-1" element={<Scope1CalcPage />} />
              <Route path="/calc/scope-2" element={<Scope2CalcPage />} />
              <Route path="/calc/scope-3" element={<Scope3CalcPage />} />
              <Route path="/calc/emission-factors" element={<EmissionFactorsCalcPage />} />
              <Route path="/calc/methane" element={<MethaneCalcPage />} />
              <Route path="/calc/flaring" element={<FlaringCalcPage />} />
              <Route path="/calc/carbon-intensity" element={<CarbonIntensityCalcPage />} />
              <Route path="/calc/water" element={<WaterCalcPage />} />
              <Route path="/calc/waste" element={<WasteCalcPage />} />
              <Route path="/calc/air-emissions" element={<AirEmissionsCalcPage />} />
              <Route path="/calc/safety-hse" element={<SafetyHseCalcPage />} />
              <Route path="/calc/social-capital" element={<SocialCapitalCalcPage />} />
              <Route path="/calc/governance" element={<GovernanceCalcPage />} />
              <Route path="/calc/formulas-rules" element={<FormulaEngineCalcPage />} />
              <Route path="/materiality/double-materiality" element={<DoubleMaterialityPage />} />
              <Route path="/materiality/stakeholder-survey" element={<StakeholderSurveyPage />} />
              <Route path="/materiality/topic-mapping" element={<TopicStandardMappingPage />} />
              <Route path="/materiality/periodic-review" element={<PeriodicReviewPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
      </BrowserRouter>
      <Toaster />
    </RootErrorBoundary>
  </StrictMode>,
);
