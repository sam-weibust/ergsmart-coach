import { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

const DEFAULT_COLOR = "#0a1628";

export interface TeamBranding {
  teamId: string | null;
  teamName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  fallbackLogo: string;
}

const TeamBrandingContext = createContext<TeamBranding>({
  teamId: null,
  teamName: null,
  logoUrl: null,
  primaryColor: DEFAULT_COLOR,
  fallbackLogo: crewsyncLogo,
});

export function useTeamBranding() {
  return useContext(TeamBrandingContext);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r
    ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}`
    : "10, 22, 40";
}

function applyToDom(color: string) {
  document.documentElement.style.setProperty("--team-color", color);
  document.documentElement.style.setProperty("--team-color-rgb", hexToRgb(color));
}

const cacheKey = (uid: string) => `crewsync_team_branding_${uid}`;

interface Cached {
  teamId: string;
  teamName: string | null;
  logoUrl: string | null;
  primaryColor: string;
}

function readCache(uid: string): Cached | null {
  try { return JSON.parse(localStorage.getItem(cacheKey(uid)) ?? "null"); }
  catch { return null; }
}

function writeCache(uid: string, v: Cached) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(v)); } catch {}
}

function clearCache(uid: string) {
  try { localStorage.removeItem(cacheKey(uid)); } catch {}
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function TeamBrandingProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [branding, setBranding] = useState<TeamBranding>({
    teamId: null,
    teamName: null,
    logoUrl: null,
    primaryColor: DEFAULT_COLOR,
    fallbackLogo: crewsyncLogo,
  });

  // ── Step 1: get current user, apply cached branding immediately ──────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const cached = readCache(uid);
      if (cached) {
        setBranding({
          teamId: cached.teamId,
          teamName: cached.teamName,
          logoUrl: cached.logoUrl,
          primaryColor: cached.primaryColor,
          fallbackLogo: crewsyncLogo,
        });
        applyToDom(cached.primaryColor);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (event === "SIGNED_OUT") {
        if (uid) clearCache(uid);
        setBranding({ teamId: null, teamName: null, logoUrl: null, primaryColor: DEFAULT_COLOR, fallbackLogo: crewsyncLogo });
        applyToDom(DEFAULT_COLOR);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Step 2: fetch fresh branding in background ───────────────────────────
  const { data: teamData } = useQuery({
    queryKey: ["global-team-branding", userId],
    queryFn: async () => {
      if (!userId) return null;

      // Coach's own team first
      const { data: ownTeam } = await supabase
        .from("teams")
        .select("id, name, logo_url, primary_color")
        .eq("coach_id", userId)
        .limit(1)
        .maybeSingle();
      if (ownTeam) return ownTeam;

      // Member team
      const { data: mem } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (!mem?.team_id) return null;

      const { data: team } = await supabase
        .from("teams")
        .select("id, name, logo_url, primary_color")
        .eq("id", mem.team_id)
        .maybeSingle();
      return team ?? null;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  // ── Step 3: apply fresh data and update localStorage ────────────────────
  useEffect(() => {
    if (!teamData || !userId) return;
    const color = teamData.primary_color || DEFAULT_COLOR;
    const updated: TeamBranding = {
      teamId: teamData.id,
      teamName: teamData.name ?? null,
      logoUrl: teamData.logo_url ?? null,
      primaryColor: color,
      fallbackLogo: crewsyncLogo,
    };
    setBranding(updated);
    applyToDom(color);
    writeCache(userId, {
      teamId: teamData.id,
      teamName: teamData.name ?? null,
      logoUrl: teamData.logo_url ?? null,
      primaryColor: color,
    });
  }, [teamData, userId]);

  return (
    <TeamBrandingContext.Provider value={branding}>
      {children}
    </TeamBrandingContext.Provider>
  );
}
