import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Kanban, Heart, Sparkles, Mail, School } from "lucide-react";
import { RecruitDiscoverFeed } from "./RecruitDiscoverFeed";
import { RecruitingBoard } from "./RecruitingBoard";
import { FollowedAthletes } from "./FollowedAthletes";
import { RecommendedAthletes } from "./RecommendedAthletes";
import { ContactHistorySection } from "./ContactHistorySection";
import { CoachProgramProfile } from "./CoachProgramProfile";

const TABS = [
  { id: "discover", label: "Discover", icon: Search },
  { id: "board", label: "Recruiting Board", icon: Kanban },
  { id: "following", label: "Following", icon: Heart },
  { id: "recommended", label: "Recommended", icon: Sparkles },
  { id: "contacts", label: "Contact History", icon: Mail },
  { id: "program", label: "My Program", icon: School },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  initialTab?: string;
}

export function CoachesHub({ initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>((initialTab as TabId) ?? "discover");

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: coachProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["coach-program-profile", currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_profiles")
        .select("*")
        .eq("coach_id", currentUser!.id)
        .maybeSingle();
      return data;
    },
  });

  if (!currentUser || profileLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const coachId = currentUser.id;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Coaches Hub</h1>
        {coachProfile?.school_name && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {coachProfile.school_name} · {coachProfile.division ?? ""}
          </p>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex overflow-x-auto gap-1 border-b border-border pb-0 -mb-px">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {activeTab === "discover" && (
          <RecruitDiscoverFeed coachId={coachId} coachProfile={coachProfile} />
        )}
        {activeTab === "board" && (
          <RecruitingBoard coachId={coachId} coachProfile={coachProfile} />
        )}
        {activeTab === "following" && (
          <FollowedAthletes coachId={coachId} coachProfile={coachProfile} />
        )}
        {activeTab === "recommended" && (
          <RecommendedAthletes coachId={coachId} coachProfile={coachProfile} />
        )}
        {activeTab === "contacts" && (
          <ContactHistorySection coachId={coachId} />
        )}
        {activeTab === "program" && (
          <CoachProgramProfile coachId={coachId} />
        )}
      </div>
    </div>
  );
}
