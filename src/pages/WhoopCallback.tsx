import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { whoopCallback } from "@/lib/api";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";

export default function WhoopCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // encoded user_id

    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Missing authorization code or state.");
      return;
    }

    const handle = async () => {
      try {
        const userId = decodeURIComponent(state);
        console.log("[WhoopCallback] code:", code.slice(0, 8) + "…", "user_id:", userId);

        const res = await whoopCallback({
          code,
          user_id: userId,
          redirect_uri: "https://crewsync.app/auth/whoop/callback",
        });
        const data = await res.json();

        if (data.error) {
          setStatus("error");
          setErrorMsg(data.error);
          if (window.opener) {
            window.opener.postMessage({ type: "whoop_error", error: data.error }, window.location.origin);
            setTimeout(() => window.close(), 2000);
          }
          return;
        }

        setStatus("success");

        if (window.opener) {
          // Popup flow: notify opener and close.
          window.opener.postMessage(
            { type: "whoop_connected", success: true },
            window.location.origin,
          );
          setTimeout(() => window.close(), 1200);
          return;
        }

        // Direct-navigation fallback (mobile Safari / popup blocked).
        setTimeout(() => {
          navigate("/dashboard?whoop=connected", { replace: true });
        }, 2500);
      } catch (e) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "Connection failed");
        if (window.opener) {
          window.opener.postMessage({ type: "whoop_error", error: errorMsg }, window.location.origin);
          setTimeout(() => window.close(), 2000);
        }
      }
    };

    handle();
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
            <button onClick={() => window.opener ? window.close() : navigate("/")} className="text-sm text-primary hover:underline">
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
