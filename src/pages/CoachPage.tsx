import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getSessionUser } from "@/lib/getUser";
import { TeamBrandingProvider } from "@/context/TeamBrandingContext";
import CoachApp from "@/components/coach/CoachApp";
import { Loader2 } from "lucide-react";

const CoachPage = () => {
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      setUserId(session.user.id);
      setAuthReady(true);
    });
  }, [navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: authReady,
  });

  // Redirect non-coaches away from coach page
  useEffect(() => {
    if (!profile) return;
    const role = (profile as any)?.user_type || (profile as any)?.role;
    if (role !== "coach" && role !== "head_coach") {
      navigate("/dashboard", { replace: true });
    }
  }, [profile, navigate]);

  if (!authReady || profileLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Determine team ID for branding — will be resolved inside CoachApp
  return (
    <TeamBrandingProvider>
      <CoachApp profile={profile} />
    </TeamBrandingProvider>
  );
};

export default CoachPage;
