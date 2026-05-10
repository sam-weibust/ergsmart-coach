import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { whoopCallback } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";

const ORIGIN = "https://crewsync.app";
const AUTH_TIMEOUT_MS = 5000;

export default function WhoopCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = new URLSearchParams(window.location.search).get("code");
    const state = new URLSearchParams(window.location.search).get("state");

    if (!code) {
      setStatus("error");
      setErrorMsg("Missing authorization code.");
      return;
    }

    const run = async (userId: string) => {
      try {
        // Basic security check: state should match the current user ID.
        if (state && decodeURIComponent(state) !== userId) {
          throw new Error("State mismatch — possible CSRF. Please try again.");
        }

        console.log("[WhoopCallback] code:", code.slice(0, 8) + "…", "user_id:", userId);

        const res = await whoopCallback({
          code,
          user_id: userId,
          redirect_uri: `${ORIGIN}/auth/whoop/callback`,
        });

        const data = await res.json();
        console.log("[WhoopCallback] edge function response:", JSON.stringify(data));

        if (data.error) throw new Error(data.error);

        setStatus("success");

        if (window.opener) {
          // Popup flow: send postMessage AFTER confirmed success, then close.
          window.opener.postMessage(
            { type: "whoop_connected", success: true },
            ORIGIN,
          );
          await new Promise(resolve => setTimeout(resolve, 500));
          window.close();
          return;
        }

        // Direct-navigation fallback (mobile Safari / popup blocked).
        setTimeout(() => {
          navigate("/dashboard?whoop=connected", { replace: true });
        }, 2500);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Connection failed";
        console.error("[WhoopCallback] error:", msg);
        setStatus("error");
        setErrorMsg(msg);
        if (window.opener) {
          window.opener.postMessage({ type: "whoop_error", error: msg }, ORIGIN);
          await new Promise(resolve => setTimeout(resolve, 500));
          window.close();
        }
      }
    };

    // Try to get session immediately (reads from localStorage — fast).
    const attempt = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        await run(session.user.id);
        return;
      }

      // Session not yet in localStorage — poll with a 5 s hard timeout.
      let elapsed = 0;
      const POLL_MS = 200;
      while (elapsed < AUTH_TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, POLL_MS));
        elapsed += POLL_MS;
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.user?.id) {
          await run(s.user.id);
          return;
        }
      }

      // Timeout: if state param contains the user ID use it directly.
      if (state) {
        console.warn("[WhoopCallback] auth timeout — falling back to state param as user_id");
        await run(decodeURIComponent(state));
      } else {
        setStatus("error");
        setErrorMsg("Session not available. Please log in and try again.");
      }
    };

    attempt();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
        <img src={crewsyncLogo} alt="CrewSync" className="h-12 w-12 rounded-xl mx-auto" />
        {status === "loading" && (
          <>
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Connecting your Whoop account…</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Whoop Connected!</h2>
            <p className="text-sm text-muted-foreground">Recovery, sleep, and strain data is syncing to your profile.</p>
            <p className="text-xs text-muted-foreground">Closing…</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Connection Failed</h2>
            <p className="text-sm text-muted-foreground">{errorMsg || "Something went wrong."}</p>
            <button onClick={() => window.opener ? window.close() : navigate("/dashboard", { replace: true })} className="text-sm text-primary hover:underline">
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
