import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Trophy, GraduationCap, Link2, Bluetooth, Award, Medal, Utensils, Swords,
  type LucideIcon,
} from "lucide-react";
import type { AthleteTabProps } from "./types";

import { RegattasSection } from "@/components/dashboard/regattas/RegattasSection";
import { RecruitingProfileSection } from "@/components/dashboard/RecruitingProfileSection";
import WeeklyChallengeSection from "@/components/dashboard/WeeklyChallengeSection";
import AwardsSection from "@/components/dashboard/AwardsSection";
import RaceSection from "@/components/dashboard/RaceSection";
import MealPlanTab from "@/components/dashboard/MealPlanTab";
import Concept2Section from "@/components/dashboard/Concept2Section";
import WhoopConnectSection from "@/components/dashboard/WhoopConnectSection";
import HealthKitConnect from "@/components/dashboard/HealthKitConnect";
import DeviceSection from "@/components/dashboard/DeviceSection";

/**
 * MORE TAB — the athlete-side counterpart to the coach's CoachMoreGrid.
 *
 * Always visible in the bottom bar, for every role, with or without a team: a
 * scrollable grid of cards, each opening the existing full section inside a
 * bottom sheet. This was previously a section at the foot of the Me tab, which
 * meant everything here was reachable only after scrolling past seven summary
 * cards.
 */
type MoreId =
  | "regattas" | "recruiting" | "connected" | "devices"
  | "achievements" | "challenges" | "nutrition" | "h2h";

const MORE_ITEMS: { id: MoreId; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "regattas",    label: "Regattas",           desc: "Results & racing history",   icon: Trophy },
  { id: "recruiting",  label: "Recruiting Profile", desc: "College recruiting details", icon: GraduationCap },
  { id: "connected",   label: "Connected Apps",     desc: "Concept2, Whoop, Health",    icon: Link2 },
  { id: "achievements",label: "Achievements",       desc: "Badges and milestones",      icon: Award },
  { id: "challenges",  label: "Weekly Challenges",  desc: "This week's community goal", icon: Medal },
  { id: "nutrition",   label: "Nutrition",          desc: "Meals, macros and water",    icon: Utensils },
  { id: "h2h",         label: "H2H Racing",         desc: "Head-to-head race history",  icon: Swords },
  { id: "devices",     label: "Devices",            desc: "Pair your PM5 & HR strap",   icon: Bluetooth },
];

const MORE_TITLES: Record<MoreId, string> = {
  regattas: "Regattas",
  recruiting: "Recruiting Profile",
  connected: "Connected Apps",
  devices: "Devices",
  achievements: "Achievements",
  challenges: "Weekly Challenges",
  nutrition: "Nutrition",
  h2h: "H2H Racing",
};

export default function MoreTab({ profile, teamColor }: AthleteTabProps) {
  const [detail, setDetail] = useState<MoreId | null>(null);
  const accent = teamColor || "#1A1A2E";

  return (
    <div className="p-4 pb-28 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">More</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everything else in your CrewSync account.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {MORE_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setDetail(item.id)}
              className="rounded-xl border border-border bg-card p-3 text-left active:scale-[0.97] transition-transform flex flex-col gap-2 min-h-[96px]"
            >
              <div className="rounded-lg p-2 w-fit" style={{ background: `${accent}1a` }}>
                <Icon className="h-5 w-5" style={{ color: accent }} />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">{item.label}</div>
                <div className="text-xs text-muted-foreground leading-snug mt-0.5">{item.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent
          side="bottom"
          className="h-[92vh] overflow-y-auto p-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        >
          <SheetHeader className="mb-3">
            <SheetTitle>{detail ? MORE_TITLES[detail] : ""}</SheetTitle>
          </SheetHeader>

          {detail === "regattas" && <RegattasSection profile={profile} isCoach={false} />}
          {detail === "recruiting" && <RecruitingProfileSection />}
          {detail === "connected" && (
            <div className="space-y-6">
              <Concept2Section />
              <WhoopConnectSection />
              <HealthKitConnect />
            </div>
          )}
          {detail === "devices" && <DeviceSection />}
          {detail === "achievements" && <AwardsSection profile={profile} />}
          {detail === "challenges" && <WeeklyChallengeSection />}
          {detail === "nutrition" && <MealPlanTab profile={profile} />}
          {detail === "h2h" && <RaceSection />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
