import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BleProvider } from "./context/BleContext";
import { TeamBrandingProvider } from "./context/TeamBrandingContext";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import CoachPage from "./pages/CoachPage";
import Auth from "./pages/Auth";
import AthleteProfile from "./pages/AthleteProfile";
import Concept2Callback from "./pages/Concept2Callback";
import WhoopCallback from "./pages/WhoopCallback";
import DirectoryPage from "./pages/DirectoryPage";
import PersonalRecordsPage from "./pages/PersonalRecordsPage";
import NotFound from "./pages/NotFound";
import RegattaPage from "./pages/RegattaPage";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import LeaderboardPage from "./pages/LeaderboardPage";
import PricingPage from "./pages/PricingPage";
import Coaches from "./pages/Coaches";
import TeamPortalPage from "./pages/TeamPortalPage";
import RecruitingPortalPage from "./pages/RecruitingPortalPage";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { c2Callback, whoopCallback } from "@/lib/api";
import { usePushNotifications } from "@/hooks/usePushNotifications";

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

const isNative = Capacitor.isNativePlatform();

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
  usePushNotifications();

  console.log("[AppRouter] render — ready:", ready, "pathname:", window.location.pathname);

  // Handle deep link OAuth callbacks on iOS native (crewsync://auth/*/callback?code=...&state=...)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      console.log("[appUrlOpen] received URL:", url);
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");
        const state = parsed.searchParams.get("state");
        if (!code) {
          console.warn("[appUrlOpen] no code param in URL:", url);
          return;
        }

        // Close the in-app browser immediately so the user returns to the app.
        await Browser.close();

        if (url.includes("auth/concept2/callback")) {
          const redirectUri = "https://crewsync.app/auth/concept2/callback";
          console.log("[appUrlOpen] c2 callback — redirect_uri:", redirectUri, "code:", code.slice(0, 8) + "…");

          let imported = 0;
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = state ? decodeURIComponent(state) : (session?.user?.id ?? "");
            const res = await c2Callback({
              code,
              user_id: userId,
              redirect_uri: redirectUri,
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            imported = data.imported ?? 0;
            navigate("/dashboard", { replace: true });
            // Signal Concept2Section to refresh connection status
            window.dispatchEvent(new CustomEvent("c2_connected", { detail: { imported } }));
          } catch (cbErr: any) {
            console.error("[appUrlOpen] c2-callback failed:", cbErr?.message);
            navigate("/dashboard", { replace: true });
            window.dispatchEvent(new CustomEvent("c2_error", { detail: { error: cbErr?.message } }));
          }
        } else if (url.includes("auth/whoop/callback")) {
          const redirectUri = "https://crewsync.app/auth/whoop/callback";
          console.log("[appUrlOpen] whoop callback — redirect_uri:", redirectUri);
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = state ? decodeURIComponent(state) : (session?.user?.id ?? "");
            const res = await whoopCallback({
              code,
              user_id: userId,
              redirect_uri: redirectUri,
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            navigate("/dashboard", { replace: true });
            window.dispatchEvent(new CustomEvent("whoop_connected", { detail: { success: true } }));
          } catch (cbErr: any) {
            console.error("[appUrlOpen] whoop-callback failed:", cbErr?.message);
            navigate("/dashboard", { replace: true });
            window.dispatchEvent(new CustomEvent("whoop_error", { detail: { error: cbErr?.message } }));
          }
        }
      } catch (e) {
        console.error("[appUrlOpen] OAuth callback failed:", e);
        navigate("/dashboard", { replace: true });
      }
    });
    return () => { listener.then(h => h.remove()); };
  }, [navigate]);

  // Update last_active_at on the profile to track inactivity.
  const touchLastActive = useRef<(() => void) | null>(null);
  useEffect(() => {
    let lastTouch = 0;
    touchLastActive.current = async () => {
      const now = Date.now();
      if (now - lastTouch < 5 * 60 * 1000) return; // debounce 5 min
      lastTouch = now;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", session.user.id);
    };
    // Touch on meaningful user interactions.
    const events = ["click", "keydown", "touchstart"];
    const handler = () => touchLastActive.current?.();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Callback pages must complete their own logic — never redirect away from them.
    const isCallbackPath = window.location.pathname.startsWith("/auth/") && window.location.pathname.endsWith("/callback");

    // Public routes that should never auto-redirect to dashboard, even when logged in.
    const PUBLIC_PREFIXES = ["/team/", "/recruit/", "/athlete/", "/leaderboard", "/pricing", "/privacy", "/terms", "/directory", "/coaches"];
    const isPublicPath = PUBLIC_PREFIXES.some(p => window.location.pathname.startsWith(p));

    // Check 30-day inactivity — force re-auth if last_active_at is stale.
    const checkInactivityTimeout = async (userId: string) => {
      const { data } = await supabase.from("profiles").select("last_active_at").eq("id", userId).maybeSingle();
      if (!data?.last_active_at) return; // no record yet — not expired
      const daysSinceActive = (Date.now() - new Date(data.last_active_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceActive > 30) {
        console.log("[AppRouter] session expired due to 30-day inactivity — signing out");
        await supabase.auth.signOut();
      }
    };

    // Resolve the correct destination based on role.
    const getDestinationForUser = async (userId: string): Promise<string> => {
      try {
        const { data: p } = await supabase.from("profiles").select("user_type, role").eq("id", userId).maybeSingle();
        const role = (p as any)?.user_type || (p as any)?.role;
        if (role === "coach" || role === "head_coach") return "/teams/today";
      } catch {}
      return "/dashboard";
    };

    // Fast session check — reads from localStorage, resolves in <50ms typically.
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && !isCallbackPath && !isPublicPath) {
        await checkInactivityTimeout(data.session.user.id);
        // Re-check session after potential sign-out.
        const { data: recheckData } = await supabase.auth.getSession();
        if (recheckData.session) {
          // Touch last_active_at on login.
          await supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", data.session.user.id);
          const dest = await getDestinationForUser(data.session.user.id);
          navigate(dest, { replace: true });
        } else {
          navigate(isNative ? "/auth" : "/", { replace: true });
        }
      } else if (isNative && !isCallbackPath && !isPublicPath) {
        // Never show landing page on native — go straight to login.
        navigate("/auth", { replace: true });
      }
      setReady(true);
    });

    // React to future auth state changes for the lifetime of the app.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const onCallback = window.location.pathname.startsWith("/auth/") && window.location.pathname.endsWith("/callback");
      const onPublic = PUBLIC_PREFIXES.some(p => window.location.pathname.startsWith(p));
      if (event === "SIGNED_IN" && session && !onCallback && !onPublic) {
        // Touch last_active_at on every sign-in.
        supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", session.user.id);
        getDestinationForUser(session.user.id).then(dest => navigate(dest, { replace: true }));
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
      <Route path="/teams/today" element={<CoachPage />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/athlete/:username" element={<AthleteProfile />} />
      <Route path="/athlete/:username/prs" element={<PersonalRecordsPage />} />
      <Route path="/directory" element={<DirectoryPage />} />
      <Route path="/auth/concept2/callback" element={<Concept2Callback />} />
      <Route path="/auth/whoop/callback" element={<WhoopCallback />} />
      <Route path="/regatta/:id" element={<RegattaPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/coaches" element={<Coaches />} />
      <Route path="/team/:slug" element={<TeamPortalPage />} />
      <Route path="/recruit/:slug" element={<RecruitingPortalPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  console.log("[App] mounted");
  return (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <BleProvider>
          <TooltipProvider>
            <TeamBrandingProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppRouter />
              </BrowserRouter>
            </TeamBrandingProvider>
          </TooltipProvider>
        </BleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;
