import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { whoopCallback } from "@/lib/api";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";

export default function WhoopCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      setStatus("error");
      setErrorMsg("Missing authorization code or state.");
      return;
    }

    const handle = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { navigate("/auth"); return; }

        const res = await whoopCallback({ code, user_id: decodeURIComponent(state) });
        const data = await res.json();

        if (data.error) {
          setStatus("error");
          setErrorMsg(data.error);
          return;
        }

        setStatus("success");

        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .maybeSingle();

        setTimeout(() => {
          navigate(profile?.username
            ? `/athlete/${profile.username}?whoop=connected`
            : "/");
        }, 2500);
      } catch (e) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "Connection failed");
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
            <button onClick={() => navigate("/")} className="text-sm text-primary hover:underline">Go back</button>
          </>
        )}
      </div>
    </div>
  );
}
