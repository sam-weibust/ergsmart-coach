import { createContext, useContext, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

const DEFAULT_COLOR = "#0a1628";

interface TeamBranding {
  teamId: string;
  logoUrl: string | null;
  primaryColor: string;
  fallbackLogo: string;
}

const TeamBrandingContext = createContext<TeamBranding>({
  teamId: "",
  logoUrl: null,
  primaryColor: DEFAULT_COLOR,
  fallbackLogo: crewsyncLogo,
});

export function useTeamBranding() {
  return useContext(TeamBrandingContext);
}

interface Props {
  teamId: string;
  children: React.ReactNode;
}

export function TeamBrandingProvider({ teamId, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["team-branding", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("logo_url, primary_color")
        .eq("id", teamId)
        .single();
      return data;
    },
    enabled: !!teamId,
    staleTime: 60_000,
  });

  const primaryColor = data?.primary_color || DEFAULT_COLOR;
  const logoUrl = data?.logo_url || null;

  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.style.setProperty("--team-color", primaryColor);
    }
  }, [primaryColor]);

  return (
    <TeamBrandingContext.Provider value={{ teamId, logoUrl, primaryColor, fallbackLogo: crewsyncLogo }}>
      <div ref={rootRef} className="contents">
        {children}
      </div>
    </TeamBrandingContext.Provider>
  );
}
