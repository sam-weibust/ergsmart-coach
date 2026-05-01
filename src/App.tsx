import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BleProvider } from "./context/BleContext";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import AthleteProfile from "./pages/AthleteProfile";
import Concept2Callback from "./pages/Concept2Callback";
import WhoopCallback from "./pages/WhoopCallback";
import DirectoryPage from "./pages/DirectoryPage";
import PersonalRecordsPage from "./pages/PersonalRecordsPage";
import NotFound from "./pages/NotFound";
import RegattaPage from "./pages/RegattaPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import LeaderboardPage from "./pages/LeaderboardPage";
import PricingPage from "./pages/PricingPage";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 30_000,
    },
  },
});

const isNative = (() => {
  try {
    return (window as any).Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
})();

function Splash() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a1628",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <img
        src={crewsyncLogo}
        alt="CrewSync"
        style={{ width: 96, height: 96, borderRadius: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
      />
    </div>
  );
}

// Sits inside BrowserRouter so useNavigate is available.
// Handles all auth routing decisions centrally.
function AppRouter() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Fast session check — reads from localStorage, resolves in <50ms typically.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/dashboard", { replace: true });
      } else if (isNative) {
        // Never show landing page on native — go straight to login.
        navigate("/auth", { replace: true });
      }
      setReady(true);
    });

    // React to future auth state changes for the lifetime of the app.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate("/dashboard", { replace: true });
      } else if (event === "SIGNED_OUT") {
        queryClient.clear();
        navigate(isNative ? "/auth" : "/", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Hold the splash until session check resolves.
  if (!ready) return <Splash />;

  return (
    <Routes>
      {/* Landing page is web-only. Native always routes to /auth if no session. */}
      <Route path="/" element={isNative ? <Navigate to="/auth" replace /> : <LandingPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/athlete/:username" element={<AthleteProfile />} />
      <Route path="/athlete/:username/prs" element={<PersonalRecordsPage />} />
      <Route path="/directory" element={<DirectoryPage />} />
      <Route path="/auth/concept2/callback" element={<Concept2Callback />} />
      <Route path="/auth/whoop/callback" element={<WhoopCallback />} />
      <Route path="/regatta/:id" element={<RegattaPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BleProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRouter />
          </BrowserRouter>
        </TooltipProvider>
      </BleProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
