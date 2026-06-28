import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Sun, CalendarDays, Dumbbell, Medal, Users, MessageSquare, MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTeamBranding } from "@/context/TeamBrandingContext";
import TodayTab from "./TodayTab";
import TeamCalendar from "./TeamCalendar";
import ErgAssignments from "./ErgAssignments";
import WorkoutHistory from "./WorkoutHistory";
import TeamErgLeaderboard from "./TeamErgLeaderboard";
import TeamMessageBoard from "./TeamMessageBoard";
import DirectMessages from "./DirectMessages";
import AthleteTeamTab from "./AthleteTeamTab";

const ATHLETE_TABS = [
  { key: "today",       label: "Today",       Icon: Sun },
  { key: "calendar",    label: "Calendar",    Icon: CalendarDays },
  { key: "workouts",    label: "Workouts",    Icon: Dumbbell },
  { key: "leaderboard", label: "Leaderboard", Icon: Medal },
  { key: "roster",      label: "Roster",      Icon: Users },
  { key: "messages",    label: "Messages",    Icon: MessageSquare },
  { key: "regattas",    label: "Regattas",    Icon: MapPin },
];

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCox: boolean;
  profile: any;
  safesportMode?: boolean;
  boats?: any[];
  seasonId?: string | null;
}

// ── Roster tab ────────────────────────────────────────────────────────────────

const AthleteRosterTab = ({ teamMembers, profile }: { teamMembers: any[]; profile: any }) => {
  const members = teamMembers
    .map((m: any) => ({ memberId: m.id, ...m.profile }))
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const nameA = a.full_name || a.username || "";
      const nameB = b.full_name || b.username || "";
      return nameA.localeCompare(nameB);
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{members.length} teammates</p>
      <div className="grid gap-2">
        {members.map((p: any) => {
          const isMe = p?.id === profile?.id;
          const isCox = p?.role === "coxswain" || p?.user_type === "coxswain" || p?.is_coxswain;
          const isCoach = p?.role === "coach" || p?.user_type === "coach" || p?.user_type === "organizer";
          const initials = (p?.full_name || p?.username || "?").charAt(0).toUpperCase();
          return (
            <Card key={p?.id || p?.memberId} className={cn("overflow-hidden", isMe && "ring-1 ring-primary/40")}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold text-muted-foreground overflow-hidden">
                  {p?.avatar_url
                    ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                    : initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">
                      {p?.full_name || p?.username || "Athlete"}
                    </span>
                    {isMe && <Badge className="text-[10px] px-1 py-0 h-4 bg-primary text-primary-foreground">You</Badge>}
                    {isCox && <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500 text-white">COX</Badge>}
                    {isCoach && <Badge className="text-[10px] px-1 py-0 h-4 bg-blue-600 text-white">COACH</Badge>}
                    {!isCox && !isCoach && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">ATHLETE</Badge>}
                  </div>
                  {p?.grad_year && (
                    <p className="text-xs text-muted-foreground">Class of {p.grad_year}</p>
                  )}
                  {!isCoach && !isCox && p?.years_rowing != null && (
                    <p className="text-xs text-muted-foreground">{p.years_rowing} seasons rowing</p>
                  )}
                  {isCox && p?.cox_years_coxing != null && (
                    <p className="text-xs text-muted-foreground">{p.cox_years_coxing} seasons coxing</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No teammates yet.</p>
        )}
      </div>
    </div>
  );
};

// ── Regattas tab ──────────────────────────────────────────────────────────────

const AthleteRegattasTab = ({ teamId }: { teamId: string }) => {
  const todayStr = new Date().toISOString().split("T")[0];

  const { data: regattas = [], isLoading } = useQuery({
    queryKey: ["athlete-regattas", teamId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("regattas")
        .select("*")
        .eq("team_id", teamId)
        .order("date", { ascending: false });
      return data || [];
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-8 text-center">Loading...</p>;

  const upcoming = (regattas as any[]).filter((r) => r.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
  const past = (regattas as any[]).filter((r) => r.date < todayStr);

  if (regattas.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No regattas added yet.</p>;
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Upcoming</h3>
          <div className="space-y-2">
            {upcoming.map((r: any) => {
              const days = Math.round((new Date(r.date).getTime() - new Date(todayStr).getTime()) / 86400000);
              return (
                <Card key={r.id}>
                  <CardContent className="py-3 px-4 flex items-start gap-3">
                    <div className="text-center bg-primary/10 rounded-lg px-2 py-1.5 min-w-[48px] shrink-0">
                      <p className="text-primary font-bold text-sm leading-none">{days === 0 ? "Today" : `${days}d`}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        {r.location && ` — ${r.location}`}
                      </p>
                      {Array.isArray(r.events) && r.events.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {r.events.map((ev: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{ev}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Past Regattas</h3>
          <div className="space-y-2">
            {past.slice(0, 15).map((r: any) => (
              <Card key={r.id}>
                <CardContent className="py-3 px-4">
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {r.location && ` — ${r.location}`}
                  </p>
                  {r.notes && <p className="text-xs text-muted-foreground mt-1 italic">{r.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getTeamAbbr = (name: string): string => {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 5).toUpperCase();
};

// ── Main component ────────────────────────────────────────────────────────────

const AthleteTeamsView = ({
  teamId, teamName, teamMembers, isCox, profile,
  safesportMode = true, boats = [], seasonId,
}: Props) => {
  const [topTab, setTopTab] = useState<"me" | "team">("me");
  const [activeTab, setActiveTab] = useState("today");
  const { logoUrl, primaryColor, fallbackLogo } = useTeamBranding();
  const teamAbbr = getTeamAbbr(teamName);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["athlete-unread-messages", teamId, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count } = await (supabase as any)
        .from("coach_athlete_messages")
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("recipient_athlete_id", profile.id);
      return count || 0;
    },
    refetchInterval: 30000,
    enabled: !!profile?.id,
  });

  const commonProps = { teamId, teamName, teamMembers, isCoach: false, profile, seasonId, boats };

  const renderMeTab = () => {
    switch (activeTab) {
      case "today":
        return <TodayTab {...commonProps} onNavigate={setActiveTab} />;
      case "calendar":
        return <TeamCalendar {...commonProps} />;
      case "workouts":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Coach Assigned Workouts</h3>
              <ErgAssignments teamId={teamId} teamMembers={teamMembers} isCoach={false} profile={profile} boats={boats} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">On-Water History</h3>
              <WorkoutHistory teamId={teamId} teamMembers={teamMembers} isCoach={false} profile={profile} boats={boats} />
            </div>
          </div>
        );
      case "leaderboard":
        return <TeamErgLeaderboard teamId={teamId} teamName={teamName} teamMembers={teamMembers} isCoach={false} profile={profile} />;
      case "roster":
        return <AthleteRosterTab teamMembers={teamMembers} profile={profile} />;
      case "messages":
        return (
          <div className="space-y-6">
            <TeamMessageBoard {...commonProps} />
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Messages with Coaches</h3>
              <DirectMessages teamId={teamId} teamMembers={teamMembers} isCoach={false} profile={profile} safesportMode={safesportMode} />
            </div>
          </div>
        );
      case "regattas":
        return <AthleteRegattasTab teamId={teamId} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Team branding header */}
      <div className="flex items-center gap-3 px-1 pb-3 mb-1 border-b border-border">
        <img
          src={logoUrl || fallbackLogo}
          alt={teamName}
          className="h-9 w-9 rounded-xl object-cover shrink-0"
          style={{ boxShadow: `0 0 0 2px ${primaryColor}22` }}
        />
        <div>
          <h2 className="text-base font-bold text-foreground truncate" style={{ color: primaryColor }}>{teamName}</h2>
          {isCox && <p className="text-xs text-muted-foreground">Coxswain</p>}
        </div>
      </div>

      {/* Top-level Me / Team tabs */}
      <div
        className="sticky top-0 z-30 -mx-4 px-0 mb-0"
        style={{ background: primaryColor }}
      >
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTopTab("me")}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors",
              topTab === "me"
                ? "border-white text-white"
                : "border-transparent text-white/50 hover:text-white/80"
            )}
          >
            Me
          </button>
          <button
            onClick={() => setTopTab("team")}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors",
              topTab === "team"
                ? "border-white text-white"
                : "border-transparent text-white/50 hover:text-white/80"
            )}
          >
            {teamAbbr}
          </button>
        </div>

        {/* ATHLETE_TABS — only shown in "me" mode */}
        {topTab === "me" && (
          <div className="flex overflow-x-auto scrollbar-none border-t border-white/10">
            {ATHLETE_TABS.map(({ key, label, Icon }) => {
              const isActive = activeTab === key;
              const showBadge = key === "messages" && unreadCount > 0;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors relative",
                    isActive
                      ? "border-white text-white"
                      : "border-transparent text-white/50 hover:text-white/80"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                  {showBadge && (
                    <span className="absolute top-1.5 right-1.5 h-3.5 w-3.5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-w-0 mt-4">
        {topTab === "me" ? (
          renderMeTab()
        ) : (
          <AthleteTeamTab
            teamId={teamId}
            teamName={teamName}
            teamMembers={teamMembers}
            isCox={isCox}
            profile={profile}
            boats={boats}
            seasonId={seasonId}
            onLogPractice={() => { setTopTab("me"); setActiveTab("workouts"); }}
          />
        )}
      </div>
    </div>
  );
};

export default AthleteTeamsView;
