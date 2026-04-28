import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on auth errors — they won't self-heal without a sign-in
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
      staleTime: 30_000, // 30s — avoids re-fetching on every tab focus
    },
  },
});

// Root-level auth listener: clears the query cache on sign-out so stale data
// from a previous user never bleeds into a new session.
function AuthBridge() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  return null;
}

// Guards the root "/" route — checks session (fast localStorage read) before
// rendering anything. Logged-in users are redirected immediately to /dashboard
// without the LandingPage ever rendering. Shows a plain navy screen while
// the check runs so there is no white flash.
function RootRoute() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/dashboard", { replace: true });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) {
    return <div style={{ position: "fixed", inset: 0, background: "#0a1628" }} />;
  }

  return <LandingPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BleProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthBridge />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRoute />} />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </BleProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
