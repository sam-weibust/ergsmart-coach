import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { c2Callback } from "@/lib/api";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";

export default function Concept2Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [imported, setImported] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state"); // user_id

    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Missing authorization code or state.");
      return;
    }

    const handleCallback = async () => {
      try {
        // Use getSession() first — it reads from localStorage and works reliably on
        // iOS Safari after a same-tab redirect (getUser() requires a network round-trip
        // and can fail if the tab was just restored from a redirect).
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (!user) {
          navigate("/auth");
          return;
        }

        const res = await c2Callback({ code, user_id: decodeURIComponent(state) });
        const data = await res.json();

        if (data.error) {
          setStatus("error");
          setErrorMsg(data.error);
          if (window.opener) {
            window.opener.postMessage({ type: "c2_auth_error", error: data.error }, "*");
            setTimeout(() => window.close(), 2000);
          }
          return;
        }

        setImported(data.imported ?? 0);
        setStatus("success");

        // If opened as a popup from DeviceSection, signal the opener and close
        if (window.opener) {
          window.opener.postMessage({ type: "c2_auth_success", imported: data.imported ?? 0 }, "*");
          setTimeout(() => window.close(), 1500);
          return;
        }

        // Redirect to profile with success param after 3 seconds
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle();

        setTimeout(() => {
          if (profile?.username) {
            navigate(`/athlete/${profile.username}?c2=connected&imported=${data.imported ?? 0}`);
          } else {
            navigate("/");
          }
        }, 3000);
      } catch (e) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "Connection failed");
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
        <img src={crewsyncLogo} alt="CrewSync" className="h-12 w-12 rounded-xl mx-auto" />
        {status === "loading" && (
          <>
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Connecting your Concept2 account…</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Concept2 Connected!</h2>
            <p className="text-sm text-muted-foreground">
              {imported > 0
                ? `Imported ${imported} workout${imported === 1 ? "" : "s"} from your Concept2 logbook.`
                : "Your account is connected. Workouts will sync shortly."}
            </p>
            <p className="text-xs text-muted-foreground">Redirecting to your profile…</p>
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
            <button
              onClick={() => navigate("/")}
              className="text-sm text-primary hover:underline"
            >
              Go back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
