import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Ship, BarChart3, Waves, ArrowLeftRight,
  Activity, Trophy, GraduationCap, Users, Calendar, Medal, MessageSquare,
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

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Ship, BarChart3, Waves, ArrowLeftRight,
  Activity, Trophy, GraduationCap, Users, Calendar, Medal, MessageSquare,
};

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

const TeamOptimizationDashboard = ({ teamId, teamName, teamMembers, isCoach, profile }: Props) => {
  const [activeSection, setActiveSection] = useState("overview");

  const renderSection = () => {
    const commonProps = { teamId, teamName, teamMembers, isCoach, profile };
    switch (activeSection) {
      case "overview": return <TeamOverview {...commonProps} />;
      case "lineups": return <BoatLineupBuilder {...commonProps} />;
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
      default: return <TeamOverview {...commonProps} />;
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-[600px]">
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex flex-col w-52 shrink-0">
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

      {/* Mobile horizontal scroll strip + main content stacked */}
      <div className="flex flex-col flex-1 min-w-0 gap-4">
        {/* Mobile tab strip */}
        <div className="md:hidden overflow-x-auto pb-1">
          <div className="flex gap-1.5 w-max">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = ICON_MAP[item.icon];
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                    activeSection === item.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
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
