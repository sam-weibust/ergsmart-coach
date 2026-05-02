import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LayoutDashboard, Ship, BarChart3, Waves, ArrowLeftRight,
  Activity, Trophy, GraduationCap, Users, Calendar, Medal, MessageSquare,
  CalendarDays, History, Settings, TrendingDown,
} from "lucide-react";
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

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Ship, BarChart3, Waves, ArrowLeftRight,
  Activity, Trophy, GraduationCap, Users, Calendar, Medal, MessageSquare,
  CalendarDays, History, Settings, TrendingDown,
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

  const commonProps = { teamId, teamName, teamMembers, isCoach, profile, seasonId: effectiveSeasonId, boats };

  const renderSection = () => {
    switch (activeSection) {
      case "overview": return <TeamOverview {...commonProps} />;
      case "calendar": return <TeamCalendar {...commonProps} />;
      case "lineups": return <BoatLineupBuilder {...commonProps} />;
      case "lineup_history": return <LineupHistory teamId={teamId} isCoach={isCoach} boats={boats} />;
      case "boat_perf": return <BoatPerformanceHistory teamId={teamId} isCoach={isCoach} boats={boats} seasonId={effectiveSeasonId} />;
      case "history": return <WorkoutHistory {...commonProps} />;
      case "erg_scores": return <ErgScoreManager {...commonProps} />;
      case "onwater": return <OnWaterResults {...commonProps} />;
      case "seat_racing": return <SeatRacingAnalysis {...commonProps} />;
      case "load": return <LoadManagement {...commonProps} />;
      case "race_optimizer": return <RaceLineupOptimizer {...commonProps} />;
      case "recruiting": return <RecruitingGaps {...commonProps} />;
      case "depth": return <ProgramDepth {...commonProps} />;
      case "training_plan": return <TeamTrainingPlanSection {...commonProps} />;
      case "leaderboard": return <TeamErgLeaderboard {...commonProps} />;
      case "board": return <TeamMessageBoard {...commonProps} />;
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
      <div className="hidden md:flex flex-col w-52 shrink-0 gap-2">
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
                <span className="truncate">{item.label}</span>
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
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors",
                    isActive
                      ? "border-white text-white"
                      : "border-transparent text-white/50 hover:text-white/80"
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                  {item.label}
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
