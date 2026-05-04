import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LayoutDashboard, Ship, BarChart3, Waves, ArrowLeftRight,
  Activity, Trophy, GraduationCap, Users, Calendar, Medal, MessageSquare,
  CalendarDays, History, Settings, TrendingDown, MessageCircle, GitCompare, Sun,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SIDEBAR_ITEMS } from "./constants";
import TeamOverview from "./TeamOverview";
import BoatLineupBuilder from "./BoatLineupBuilder";
import ErgScoreManager from "./ErgScoreManager";
import OnWaterResults from "./OnWaterResults";
import SeatRacingAnalysis from "./SeatRacingAnalysis";
import LoadManagement from "./LoadManagement";
import RaceLineupOptimizer from "./RaceLineupOptimizer";
import RecruitingGaps from "./RecruitingGaps";
import ProgramDepth from "./ProgramDepth";
import TeamTrainingPlanSection from "./TeamTrainingPlanSection";
import TeamErgLeaderboard from "./TeamErgLeaderboard";
import TeamMessageBoard from "./TeamMessageBoard";
import TeamCalendar from "./TeamCalendar";
import WorkoutHistory from "./WorkoutHistory";
import SeasonManager from "./SeasonManager";
import BoatManager from "./BoatManager";
import LineupHistory from "./LineupHistory";
import BoatPerformanceHistory from "./BoatPerformanceHistory";
import PracticeDetail from "./PracticeDetail";
import CoachManagement from "./CoachManagement";
import DirectMessages from "./DirectMessages";
import WorkoutComparison from "./WorkoutComparison";
import TodayTab from "./TodayTab";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Ship, BarChart3, Waves, ArrowLeftRight,
  Activity, Trophy, GraduationCap, Users, Calendar, Medal, MessageSquare,
  CalendarDays, History, Settings, TrendingDown, MessageCircle, GitCompare, Sun,
};

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  initialSection?: string;
}

const TeamOptimizationDashboard = ({ teamId, teamName, teamMembers, isCoach, profile, initialSection }: Props) => {
  const [activeSection, setActiveSection] = useState(initialSection ?? "overview");
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("all");

  const { data: seasons = [] } = useQuery({
    queryKey: ["team-seasons", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_seasons")
        .select("*")
        .eq("team_id", teamId)
        .order("start_date", { ascending: false });
      return data || [];
    },
  });

  const { data: boats = [] } = useQuery({
    queryKey: ["team-boats", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_boats")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  // Auto-select active season on first load
  const activeSeason = seasons.find((s: any) => s.is_active);
  const effectiveSeasonId = selectedSeasonId === "all" ? null : selectedSeasonId;

  const { data: unreadMessageCount = 0 } = useQuery({
    queryKey: ["unread-messages", teamId, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      const { count } = await supabase
        .from("direct_messages" as any)
        .select("*", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("recipient_id", profile.id)
        .eq("read", false);
      return count || 0;
    },
    refetchInterval: 30000,
    enabled: !!profile?.id,
  });

  const commonProps = { teamId, teamName, teamMembers, isCoach, profile, seasonId: effectiveSeasonId, boats };

  const renderSection = () => {
    switch (activeSection) {
      case "today": return <TodayTab {...commonProps} onNavigate={(s) => setActiveSection(s)} />;
      case "overview": return <TeamOverview {...commonProps} />;
      case "calendar": return <TeamCalendar {...commonProps} />;
      case "lineups": return <BoatLineupBuilder {...commonProps} />;
      case "lineup_history": return <LineupHistory teamId={teamId} isCoach={isCoach} boats={boats} />;
      case "practice_detail": return <PracticeDetail teamId={teamId} isCoach={isCoach} profile={profile} seasonId={effectiveSeasonId} />;
      case "boat_perf": return <BoatPerformanceHistory teamId={teamId} isCoach={isCoach} boats={boats} seasonId={effectiveSeasonId} />;
      case "history": return <WorkoutHistory {...commonProps} />;
      case "erg_scores": return <ErgScoreManager {...commonProps} />;
      case "workout_comparison": return <WorkoutComparison teamId={teamId} isCoach={isCoach} profile={profile} seasonId={effectiveSeasonId} boats={boats} />;
      case "onwater": return <OnWaterResults {...commonProps} />;
      case "seat_racing": return <SeatRacingAnalysis {...commonProps} />;
      case "load": return <LoadManagement {...commonProps} />;
      case "race_optimizer": return <RaceLineupOptimizer {...commonProps} />;
      case "recruiting": return <RecruitingGaps {...commonProps} />;
      case "depth": return <ProgramDepth {...commonProps} />;
      case "training_plan": return <TeamTrainingPlanSection {...commonProps} />;
      case "leaderboard": return <TeamErgLeaderboard {...commonProps} />;
      case "messages": return <DirectMessages teamId={teamId} teamMembers={teamMembers} isCoach={isCoach} profile={profile} />;
      case "board": return <TeamMessageBoard {...commonProps} />;
      case "coaches": return (
        <CoachManagement teamId={teamId} teamName={teamName} isCoach={isCoach} profile={profile} />
      );
      case "settings": return (
        <div className="space-y-8">
          <SeasonManager teamId={teamId} isCoach={isCoach} />
          <BoatManager teamId={teamId} isCoach={isCoach} />
        </div>
      );
      default: return <TeamOverview {...commonProps} />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-[600px]">
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex flex-col w-52 shrink-0 gap-2 sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
        {/* Season selector */}
        {seasons.length > 0 && (
          <Select value={selectedSeasonId} onValueChange={setSelectedSeasonId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All seasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All seasons</SelectItem>
              {seasons.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}{s.is_active ? " ●" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <nav className="space-y-0.5">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = ICON_MAP[item.icon];
            const showBadge = item.key === "messages" && unreadMessageCount > 0;
            return (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
                  activeSection === item.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span className="truncate flex-1">{item.label}</span>
                {showBadge && (
                  <Badge className="h-4 px-1 text-[10px] rounded-full ml-auto">{unreadMessageCount}</Badge>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile: sticky tab bar + content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Season selector mobile */}
        {seasons.length > 0 && (
          <div className="md:hidden mb-2">
            <Select value={selectedSeasonId} onValueChange={setSelectedSeasonId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All seasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All seasons</SelectItem>
                {seasons.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}{s.is_active ? " ●" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Sticky horizontal tab bar — mobile only */}
        <div className="md:hidden sticky top-0 z-20 bg-[#0a1628] border-b border-white/10 -mx-4 px-0 mb-4">
          <div className="flex overflow-x-auto scrollbar-none">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = ICON_MAP[item.icon];
              const isActive = activeSection === item.key;
              const showBadge = item.key === "messages" && unreadMessageCount > 0;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors relative",
                    isActive
                      ? "border-white text-white"
                      : "border-transparent text-white/50 hover:text-white/80"
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                  {item.label}
                  {showBadge && (
                    <span className="absolute top-1.5 right-1.5 h-3.5 w-3.5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center">
                      {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {renderSection()}
        </div>
      </div>
    </div>
  );
};

export default TeamOptimizationDashboard;
