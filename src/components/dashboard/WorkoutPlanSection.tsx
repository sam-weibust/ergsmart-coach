import { useEffect, useMemo, useState } from "react";
import { getSessionUser } from '@/lib/getUser';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeAI } from "@/lib/aiInvoke";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays, ChevronDown, ChevronUp, Download, Dumbbell,
  FileImage, Loader2, Printer, Share2, Utensils, Settings2, Check,
} from "lucide-react";
import { SpreadsheetUpload } from "./SpreadsheetUpload";
import { PrintableWeeklyPlan } from "./PrintableWeeklyPlan";
import { GenerationProgress } from "./GenerationProgress";
import { Calendar } from "@/components/ui/calendar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  full_name?: string | null;
  weight: number | null;
  height: number | null;
  experience_level?: string | null;
  goals?: string | null;
  age?: number | null;
  health_issues?: string[] | null;
  user_type?: string | null;
};

type WorkoutPlan = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  workout_data: any;
  created_at?: string;
  is_coach_assigned?: boolean;
  coach_plan_id?: string | null;
};

type Friend = {
  id: string;
  friend: { id: string; full_name?: string | null; email?: string | null };
};

type Team = { id: string; name: string; level?: string | null };

type PlanPreferences = {
  training_goal: string;
  intensity: string;
  goal_date: string | null;
  include_lifting: boolean;
  lifting_days_per_week: number;
  include_two_a_days: boolean;
};

type GenerationProgressState = { currentBatch: number; totalBatches: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const extractWorkoutWeeks = (workout_data: any): any[] => {
  if (!workout_data) return [];
  if (Array.isArray(workout_data)) return workout_data;
  if (Array.isArray(workout_data?.plan)) return workout_data.plan;
  if (Array.isArray(workout_data?.weeks)) return workout_data.weeks;
  return [];
};

const getZoneColor = (zone?: string) => {
  switch (zone?.toUpperCase()) {
    case "UT2": return "bg-green-500/20 text-green-700 border-green-500/30";
    case "UT1": return "bg-blue-500/20 text-blue-700 border-blue-500/30";
    case "TR": case "TR1": case "TR2": return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
    case "AT": return "bg-red-500/20 text-red-700 border-red-500/30";
    default: return "bg-muted text-muted-foreground";
  }
};

const TRAINING_GOALS = [
  { value: "general_fitness", label: "General Fitness", desc: "Improve overall rowing fitness" },
  { value: "erg_testing", label: "Erg Testing", desc: "Prepare for a 2k or 6k test" },
  { value: "upcoming_race", label: "Upcoming Race", desc: "Regatta or race in the next 1–12 weeks" },
  { value: "tryouts", label: "Tryouts", desc: "Preparing for team tryouts" },
  { value: "off_season", label: "Off Season", desc: "Maintaining fitness in the off season" },
  { value: "return_from_injury", label: "Return from Injury", desc: "Coming back after time off" },
];

const INTENSITIES = [
  { value: "easy", label: "Easy", sessions: "3–4 sessions/week", meters: "~30k meters", who: "Beginners or busy schedules" },
  { value: "moderate", label: "Moderate", sessions: "5–6 sessions/week", meters: "~50k meters", who: "Standard competitive program" },
  { value: "hard", label: "Hard", sessions: "6 days/week", meters: "~70k+ meters", who: "Serious competitors" },
];

const GOAL_LABELS: Record<string, string> = {
  erg_testing: "Test date",
  upcoming_race: "Race date",
  tryouts: "Tryout date",
};

// ─── Plan Preferences Wizard ──────────────────────────────────────────────────

type WizardProps = {
  onSave: (prefs: PlanPreferences & { months: number }) => void;
  initialPrefs?: (PlanPreferences & { months?: number }) | null;
};

const PlanPreferencesWizard = ({ onSave, initialPrefs }: WizardProps) => {
  const [goal, setGoal] = useState(initialPrefs?.training_goal || "general_fitness");
  const [intensity, setIntensity] = useState(initialPrefs?.intensity || "moderate");
  const [goalDate, setGoalDate] = useState(initialPrefs?.goal_date || "");
  const [includeLift, setIncludeLift] = useState(initialPrefs?.include_lifting !== false);
  const [liftDays, setLiftDays] = useState(initialPrefs?.lifting_days_per_week || 2);
  const [twoADays, setTwoADays] = useState(initialPrefs?.include_two_a_days !== false);
  const [months, setMonths] = useState(String(initialPrefs?.months || "3"));

  const goalRequiresDate = ["erg_testing", "upcoming_race", "tryouts"].includes(goal);
  const goalDateLabel = GOAL_LABELS[goal] || "Goal date (optional)";
  const intensityInfo = INTENSITIES.find((i) => i.value === intensity);

  const goalObj = TRAINING_GOALS.find((g) => g.value === goal);
  const canGenerate = !goalRequiresDate || !!goalDate;

  const summaryText = (() => {
    const parts: string[] = [];
    parts.push(`${parseInt(months)}-month ${intensity} plan`);
    parts.push(`for ${goalObj?.label || "general fitness"}`);
    if (goalDate) parts.push(`targeting ${new Date(goalDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}`);
    const liftStr = includeLift ? `, optional lifting ${liftDays}x/week` : ", erg only";
    const twoStr = twoADays ? ", optional 2-a-days included" : "";
    return parts.join(" ") + liftStr + twoStr + ".";
  })();

  const handleGenerate = () => {
    onSave({
      training_goal: goal,
      intensity,
      goal_date: goalDate || null,
      include_lifting: includeLift,
      lifting_days_per_week: liftDays,
      include_two_a_days: twoADays,
      months: parseInt(months),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Customize Your Training Plan
        </CardTitle>
        <CardDescription>Answer a few questions to personalize your plan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Q1: Training goal */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">1. What are you training for?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TRAINING_GOALS.map((g) => (
              <button
                key={g.value}
                onClick={() => setGoal(g.value)}
                className={`text-left rounded-lg border-2 px-4 py-3 transition-all ${
                  goal === g.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <p className="text-sm font-semibold">{g.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{g.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Q2: Intensity */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">2. Plan intensity</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {INTENSITIES.map((i) => (
              <button
                key={i.value}
                onClick={() => setIntensity(i.value)}
                className={`text-left rounded-lg border-2 px-4 py-3 transition-all ${
                  intensity === i.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <p className="text-sm font-bold">{i.label}</p>
                <p className="text-xs text-muted-foreground">{i.sessions}</p>
                <p className="text-xs text-muted-foreground">{i.meters}/week</p>
                <p className="text-xs text-muted-foreground italic mt-1">{i.who}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Q3: Plan length + Goal date */}
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-semibold">3. Plan length</p>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 Months</SelectItem>
                <SelectItem value="6">6 Months</SelectItem>
                <SelectItem value="9">9 Months</SelectItem>
                <SelectItem value="12">12 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">
              {goalDateLabel}
              {goalRequiresDate && <span className="text-destructive ml-1">*</span>}
            </p>
            <input
              type="date"
              value={goalDate}
              onChange={(e) => setGoalDate(e.target.value)}
              className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {goalRequiresDate && !goalDate && (
              <p className="text-xs text-destructive">Required for {goalObj?.label}</p>
            )}
          </div>
        </div>

        {/* Q4: Lifting */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">4. Include optional lifting sessions?</p>
              <p className="text-xs text-muted-foreground">Lifting is always optional — never required</p>
            </div>
            <button
              onClick={() => setIncludeLift(!includeLift)}
              className={`relative w-11 h-6 rounded-full transition-colors ${includeLift ? "bg-primary" : "bg-muted"}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${includeLift ? "translate-x-5" : ""}`} />
            </button>
          </div>
          {includeLift && (
            <div className="flex gap-3 ml-4">
              {[
                { value: 2, label: "2 days/week", sub: "Mon & Thu" },
                { value: 3, label: "3 days/week", sub: "Mon, Wed & Sat" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLiftDays(opt.value)}
                  className={`rounded-lg border-2 px-4 py-2 text-left transition-all ${
                    liftDays === opt.value ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.sub}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Q5: 2-a-days */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">5. Show optional 2-a-days?</p>
            <p className="text-xs text-muted-foreground">Extra sessions for motivated athletes who want more volume</p>
          </div>
          <button
            onClick={() => setTwoADays(!twoADays)}
            className={`relative w-11 h-6 rounded-full transition-colors ${twoADays ? "bg-primary" : "bg-muted"}`}
          >
            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${twoADays ? "translate-x-5" : ""}`} />
          </button>
        </div>

        {/* Summary */}
        <div className="rounded-lg bg-muted/50 border border-border px-4 py-3">
          <p className="text-sm font-medium capitalize">{summaryText}</p>
        </div>

        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-700 dark:text-blue-400">
          AI Disclaimer: This plan is generated by AI. Always consult a qualified coach before making significant changes. CrewSync is not responsible for injuries from AI-generated recommendations.
        </div>

        <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full">
          Generate My Plan
        </Button>
      </CardContent>
    </Card>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ErgBlock = ({ ergWorkout }: { ergWorkout: any }) => {
  if (!ergWorkout) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <Badge variant="outline" className={getZoneColor(ergWorkout?.zone)}>
        {ergWorkout?.zone || "Erg"}
      </Badge>
      <div className="flex-1">
        <div className="font-medium">{ergWorkout?.description || ergWorkout?.title || "Workout"}</div>
        <div className="text-sm text-muted-foreground">
          {ergWorkout?.duration && `${ergWorkout.duration}`}
          {ergWorkout?.distance && ` • ${ergWorkout.distance}m`}
          {ergWorkout?.targetSplit && ` • Target: ${ergWorkout.targetSplit}`}
          {ergWorkout?.rate && ` • ${ergWorkout.rate}`}
        </div>
        {ergWorkout?.warmup && <div className="text-xs text-green-600 dark:text-green-400 mt-1">Warmup: {ergWorkout.warmup}</div>}
        {ergWorkout?.restPeriods && <div className="text-xs text-yellow-600 dark:text-yellow-400">Rest: {ergWorkout.restPeriods}</div>}
        {ergWorkout?.cooldown && <div className="text-xs text-blue-600 dark:text-blue-400">Cooldown: {ergWorkout.cooldown}</div>}
        {ergWorkout?.notes && <div className="text-xs text-muted-foreground italic mt-1">{ergWorkout.notes}</div>}
      </div>
    </div>
  );
};

const StrengthBlock = ({ strengthWorkout }: { strengthWorkout: any }) => {
  if (!strengthWorkout) return null;
  const hasArrayExercises = Array.isArray(strengthWorkout.exercises) && strengthWorkout.exercises.length > 0;
  return (
    <div className="border-l-2 border-primary/30 pl-3">
      <div className="flex items-center gap-2 mb-2">
        <Dumbbell className="h-4 w-4 text-primary" />
        <span className="font-medium">Strength: {strengthWorkout.focus || "Full Body"}</span>
      </div>
      {strengthWorkout.warmupNotes && <div className="text-xs text-green-600 dark:text-green-400 mb-1">Warmup: {strengthWorkout.warmupNotes}</div>}
      {hasArrayExercises ? (
        <div className="grid gap-1 text-sm">
          {strengthWorkout.exercises.map((ex: any, idx: number) => (
            <div key={idx} className="flex justify-between">
              <span>{ex?.exercise || ex?.name || "Exercise"}</span>
              <span className="text-muted-foreground">
                {ex?.sets ?? 0}x{ex?.reps ?? 0}
                {ex?.weight && ` @ ${ex.weight}`}
                {ex?.rest && ` (${ex.rest} rest)`}
              </span>
            </div>
          ))}
        </div>
      ) : strengthWorkout.description ? (
        <p className="text-sm">{strengthWorkout.description}</p>
      ) : null}
      {strengthWorkout.cooldownNotes && <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Cooldown: {strengthWorkout.cooldownNotes}</div>}
    </div>
  );
};

const YogaBlock = ({ yogaSession }: { yogaSession: any }) => {
  if (!yogaSession) return null;
  return (
    <div className="border-l-2 border-purple-500/30 pl-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-purple-600">🧘</span>
        <span className="font-medium">Rest Day - Yoga/Recovery</span>
        {yogaSession.duration && <Badge variant="secondary" className="text-xs">{yogaSession.duration}</Badge>}
      </div>
      {yogaSession.focus && <div className="text-sm"><span className="font-medium">Focus:</span> {yogaSession.focus}</div>}
      {yogaSession.poses && <div className="text-sm text-muted-foreground">{yogaSession.poses}</div>}
    </div>
  );
};

const MealBlock = ({ mealPlan }: { mealPlan: any }) => {
  if (!mealPlan) return null;
  return (
    <div className="border-l-2 border-secondary/30 pl-3">
      <div className="flex items-center gap-2 mb-2">
        <Utensils className="h-4 w-4 text-secondary" />
        <span className="font-medium">Meal Plan</span>
        {mealPlan.totalCalories && <Badge variant="secondary" className="text-xs">{mealPlan.totalCalories} cal</Badge>}
      </div>
      <div className="grid gap-1 text-sm">
        {mealPlan.breakfast && <div><span className="font-medium">Breakfast:</span> {mealPlan.breakfast}</div>}
        {mealPlan.lunch && <div><span className="font-medium">Lunch:</span> {mealPlan.lunch}</div>}
        {mealPlan.dinner && <div><span className="font-medium">Dinner:</span> {mealPlan.dinner}</div>}
        {mealPlan.snacks && <div><span className="font-medium">Snacks:</span> {mealPlan.snacks}</div>}
        {mealPlan.macros && <div className="text-xs text-muted-foreground mt-1">Macros: {mealPlan.macros}</div>}
      </div>
    </div>
  );
};

// New session block for required/optional new schema
const SessionBlock = ({ session, label }: { session: any; label: string }) => {
  if (!session) return null;
  const isLift = session.session_type === "lift";
  const isErg = session.session_type === "erg";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${label === "Optional" ? "border-dashed opacity-80" : ""}`}>
      <div className="flex items-center gap-2">
        <Badge variant={label === "Required" ? "default" : "secondary"} className="text-xs">
          {label}
        </Badge>
        {isErg && session.zone && (
          <Badge variant="outline" className={`text-xs ${getZoneColor(session.zone)}`}>
            {session.zone}
          </Badge>
        )}
        {isLift && (
          <Badge variant="outline" className="text-xs bg-orange-500/20 text-orange-700 border-orange-500/30">
            Lift
          </Badge>
        )}
        <span className="text-sm font-semibold">{session.title || session.description || "Session"}</span>
      </div>
      {session.description && session.description !== session.title && (
        <p className="text-sm text-muted-foreground">{session.description}</p>
      )}
      {isErg && (
        <div className="text-sm text-muted-foreground space-y-0.5">
          {session.duration && <span className="mr-3">{session.duration}</span>}
          {session.distance && <span className="mr-3">{session.distance}m</span>}
          {session.targetSplit && <span className="mr-3">Target: {session.targetSplit}</span>}
          {session.rate && <span>{session.rate}</span>}
        </div>
      )}
      {isErg && session.warmup && <div className="text-xs text-green-600 dark:text-green-400">Warmup: {session.warmup}</div>}
      {isErg && session.restPeriods && <div className="text-xs text-yellow-600">Rest: {session.restPeriods}</div>}
      {isErg && session.cooldown && <div className="text-xs text-blue-600 dark:text-blue-400">Cooldown: {session.cooldown}</div>}
      {session.note && <div className="text-xs text-muted-foreground italic">{session.note}</div>}
    </div>
  );
};

type DayCardProps = { day: any; dayIndex: number };

const DayCard = ({ day, dayIndex }: DayCardProps) => {
  const dayLabel = typeof day?.day_name === "string" ? day.day_name
    : typeof day?.day === "string" ? day.day
    : `Day ${day?.day ?? dayIndex + 1}`;

  // New schema with required/optional
  if (day?.is_rest === true) {
    return (
      <div className="p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <span className="font-medium text-lg">{dayLabel}</span>
          <Badge className="bg-green-500/20 text-green-700 border-green-500/30 text-xs">Rest Day</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Recovery. No sessions today.</p>
      </div>
    );
  }

  if (day?.required !== undefined) {
    return (
      <div className="p-4 border rounded-lg space-y-3">
        <div className="font-medium text-lg">{dayLabel}</div>
        {day.required ? (
          <SessionBlock session={day.required} label="Required" />
        ) : (
          <div className="rounded-lg border p-3">
            <Badge variant="secondary" className="text-xs mb-2">Rest</Badge>
            <p className="text-sm text-muted-foreground">Rest or active recovery</p>
          </div>
        )}
        {day.optional && <SessionBlock session={day.optional} label="Optional" />}
      </div>
    );
  }

  // Old schema fallback
  const hasPlainWorkout = typeof day?.workout === "string" && day.workout.length > 0;
  const hasStructured = !hasPlainWorkout && (day?.ergWorkout || day?.strengthWorkout || day?.yogaSession || day?.mealPlan);

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="font-medium text-lg">{dayLabel}</div>
      {hasPlainWorkout && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{day.workout}</p>}
      {hasStructured && (
        <>
          {day.ergWorkout && <ErgBlock ergWorkout={day.ergWorkout} />}
          {day.strengthWorkout && <StrengthBlock strengthWorkout={day.strengthWorkout} />}
          {day.yogaSession && <YogaBlock yogaSession={day.yogaSession} />}
          {day.mealPlan && <MealBlock mealPlan={day.mealPlan} />}
        </>
      )}
      {!hasPlainWorkout && !hasStructured && (
        <p className="text-sm text-muted-foreground">Rest / No workout</p>
      )}
    </div>
  );
};

type WeekAccordionProps = {
  planId: string;
  weeks: any[];
  expandedWeeks: string[];
  setExpandedWeeks: (values: string[]) => void;
};

const WeekAccordion = ({ planId, weeks, expandedWeeks, setExpandedWeeks }: WeekAccordionProps) => (
  <Accordion type="multiple" value={expandedWeeks} onValueChange={setExpandedWeeks} className="w-full">
    {weeks.map((week: any, weekIdx: number) => (
      <AccordionItem key={weekIdx} value={`week-${weekIdx}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex flex-col items-start gap-1 text-left">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">
                {week?.phase_label || `Week ${week?.week ?? weekIdx + 1}`}
              </h4>
              {!week?.phase_label && week?.phase && (
                <Badge variant="outline" className="text-xs">{week.phase}</Badge>
              )}
              {week?.intensity_label && (
                <Badge variant="secondary" className="text-xs">{week.intensity_label}</Badge>
              )}
            </div>
            {week?.summary && (
              <p className="text-xs text-muted-foreground font-normal">{week.summary}</p>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-3">
            {Array.isArray(week?.days) && week.days.length > 0 ? (
              week.days.map((day: any, dayIdx: number) => (
                <DayCard key={day?.day ?? dayIdx} day={day} dayIndex={dayIdx} />
              ))
            ) : (
              <div className="text-muted-foreground text-sm">No days in this week</div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    ))}
  </Accordion>
);

type SharePlanDialogProps = {
  planId: string;
  friends: Friend[] | undefined;
  teams: Team[] | undefined;
  isCoach: boolean;
  onShare: (args: { planId: string; userId?: string; teamId?: string }) => void;
};

const SharePlanDialog = ({ planId, friends, teams, isCoach, onShare }: SharePlanDialogProps) => {
  const hasFriends = !!friends && friends.length > 0;
  const hasTeams = !!teams && teams.length > 0;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4 mr-2" />
          Share Plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Share Training Plan</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {hasFriends && (
            <div>
              <h4 className="font-medium mb-2">Share with Friend</h4>
              <div className="space-y-2">
                {friends!.map((f) => (
                  <Button key={f.id} variant="outline" className="w-full justify-start" onClick={() => onShare({ planId, userId: f.friend.id })}>
                    {f.friend.full_name || f.friend.email}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {isCoach && hasTeams && (
            <div>
              <h4 className="font-medium mb-2">Share with Team</h4>
              <div className="space-y-2">
                {teams!.map((team) => (
                  <Button key={team.id} variant="outline" className="w-full justify-start" onClick={() => onShare({ planId, teamId: team.id })}>
                    {team.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {!hasFriends && !hasTeams && (
            <p className="text-muted-foreground text-center py-4">Add friends or create teams to share plans</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

type PlanListProps = {
  plans: WorkoutPlan[];
  plansLoading: boolean;
  expandedWeeks: Record<string, string[]>;
  setExpandedWeeks: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  friends: Friend[] | undefined;
  teams: Team[] | undefined;
  isCoach: boolean;
  userName?: string | null;
  onDeletePlan: (planId: string) => void;
  onSharePlan: (args: { planId: string; userId?: string; teamId?: string }) => void;
};

const PlanList = ({
  plans, plansLoading, expandedWeeks, setExpandedWeeks,
  friends, teams, isCoach, userName, onDeletePlan, onSharePlan,
}: PlanListProps) => {
  const [calendarPlanIds, setCalendarPlanIds] = useState<Set<string>>(new Set());
  const [activePlanId, setActivePlanId] = useState<string>(() => {
    try { return localStorage.getItem("lastActivePlanId") || ""; } catch { return ""; }
  });

  if (plansLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Your Training Plans</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-between items-center">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!plans || plans.length === 0) return null;

  const toggleCalendarView = (planId: string) => {
    setCalendarPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId); else next.add(planId);
      return next;
    });
  };

  const toggleAllWeeks = (planId: string, weeks: any[]) => {
    const weekIds = weeks.map((_: any, idx: number) => `week-${idx}`);
    const currentExpanded = expandedWeeks[planId] || [];
    const allExpanded = weeks.length > 0 && currentExpanded.length === weeks.length;
    setExpandedWeeks((prev) => ({ ...prev, [planId]: allExpanded ? [] : weekIds }));
  };

  return (
    <Card>
      <CardHeader><CardTitle>Your Training Plans</CardTitle></CardHeader>
      <CardContent>
        <Accordion
          type="single"
          collapsible
          className="w-full"
          value={activePlanId}
          onValueChange={(value) => {
            setActivePlanId(value);
            try { localStorage.setItem("lastActivePlanId", value); } catch {}
          }}
        >
          {plans.map((plan) => {
            const workoutWeeks = extractWorkoutWeeks(plan.workout_data);
            const planExpandedWeeks = expandedWeeks[plan.id] || [];
            const allExpanded = workoutWeeks.length > 0 && planExpandedWeeks.length === workoutWeeks.length;
            return (
              <AccordionItem key={plan.id} value={plan.id}>
                <AccordionTrigger>
                  <div className="flex justify-between w-full pr-4">
                    <span>{plan.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {plan.created_at ? new Date(plan.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    {plan.is_coach_assigned && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                        <span className="text-blue-600 mt-0.5 shrink-0 text-base">ℹ</span>
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                          This plan was assigned by your coach. Personalized to your 2K time.
                        </p>
                      </div>
                    )}
                    {workoutWeeks.length > 0 && workoutWeeks[0]?.fileUrl && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileImage className="h-4 w-4" />
                          <span>Uploaded: {workoutWeeks[0]?.fileName}</span>
                        </div>
                        {workoutWeeks[0]?.fileType === "pdf" ? (
                          <iframe src={workoutWeeks[0].fileUrl} className="w-full h-[500px] border rounded-lg" title="Workout Plan PDF" />
                        ) : (
                          <img src={workoutWeeks[0].fileUrl} alt="Workout Plan" className="w-full rounded-lg border" />
                        )}
                        <Button variant="outline" size="sm" onClick={() => window.open(workoutWeeks[0].fileUrl, "_blank")}>
                          <Printer className="h-4 w-4 mr-2" />
                          Open in New Tab / Print
                        </Button>
                      </div>
                    )}

                    {workoutWeeks.length > 0 && !workoutWeeks[0]?.fileUrl && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => toggleCalendarView(plan.id)}>
                          <CalendarDays className="h-4 w-4 mr-2" />
                          {calendarPlanIds.has(plan.id) ? "List View" : "Calendar View"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => downloadICS(plan)}>
                          <Download className="h-4 w-4 mr-2" />
                          Export .ics
                        </Button>
                      </div>
                    )}

                    {workoutWeeks.length > 0 && !workoutWeeks[0]?.fileUrl && calendarPlanIds.has(plan.id) && (
                      <PlanCalendarView plan={plan} />
                    )}

                    {workoutWeeks.length > 0 && !workoutWeeks[0]?.fileUrl && !calendarPlanIds.has(plan.id) && (
                      <PrintableWeeklyPlan weeks={workoutWeeks} title={plan.title} userName={userName ?? undefined} />
                    )}

                    {workoutWeeks.length > 0 && !workoutWeeks[0]?.fileUrl && !calendarPlanIds.has(plan.id) && (
                      <div className="flex justify-end mb-2">
                        <Button variant="outline" size="sm" onClick={() => toggleAllWeeks(plan.id, workoutWeeks)}>
                          {allExpanded ? (
                            <><ChevronUp className="h-4 w-4 mr-1" />Collapse All Weeks</>
                          ) : (
                            <><ChevronDown className="h-4 w-4 mr-1" />Expand All Weeks</>
                          )}
                        </Button>
                      </div>
                    )}

                    {!calendarPlanIds.has(plan.id) && (
                      workoutWeeks.length > 0 ? (
                        <WeekAccordion
                          planId={plan.id}
                          weeks={workoutWeeks}
                          expandedWeeks={planExpandedWeeks}
                          setExpandedWeeks={(values) => setExpandedWeeks((prev) => ({ ...prev, [plan.id]: values }))}
                        />
                      ) : (
                        <div className="text-muted-foreground p-4 text-center">
                          {plan.workout_data ? "Unable to display workout data" : "No workout data available"}
                        </div>
                      )
                    )}

                    <div className="flex flex-wrap gap-2 pt-4 border-t">
                      <SharePlanDialog planId={plan.id} friends={friends} teams={teams} isCoach={isCoach} onShare={onSharePlan} />
                      <Button variant="outline" size="sm" onClick={() => downloadICS(plan)}>
                        <Download className="h-4 w-4 mr-2" />
                        Export .ics
                      </Button>
                      {!plan.is_coach_assigned && (
                        <Button variant="destructive" size="sm" onClick={() => onDeletePlan(plan.id)}>
                          Delete Plan
                        </Button>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
};

// ─── ICS export ───────────────────────────────────────────────────────────────

const sanitizeICS = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

const generateICS = (plan: WorkoutPlan): string => {
  const startDate = plan.created_at ? new Date(plan.created_at) : new Date();
  const weeks = extractWorkoutWeeks(plan.workout_data);
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

  const events = weeks.flatMap((week: any, wi: number) =>
    (Array.isArray(week?.days) ? week.days : []).map((day: any, di: number) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + wi * 7 + di);
      const dateStr = fmtDate(d);

      const summary = day?.required?.title || day?.ergWorkout
        ? `${day.required?.zone || day.ergWorkout?.zone ? (day.required?.zone || day.ergWorkout?.zone) + ": " : ""}${day.required?.title || day.ergWorkout?.description || "Erg Workout"}`
        : day?.strengthWorkout ? `Strength: ${day.strengthWorkout?.focus || "Workout"}`
        : day?.yogaSession ? "Rest / Recovery"
        : day?.workout ? String(day.workout).slice(0, 60)
        : "Training Day";

      const description = day?.required?.description || day?.workout || day?.ergWorkout?.description || "";

      const lines = [
        "BEGIN:VEVENT",
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${dateStr}`,
        `SUMMARY:${sanitizeICS(summary)}`,
        description ? `DESCRIPTION:${sanitizeICS(description)}` : null,
        `UID:${plan.id}-w${wi}-d${di}@crewsync`,
        "END:VEVENT",
      ];
      return lines.filter(Boolean).join("\r\n");
    })
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CrewSync//Training Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
};

const downloadICS = (plan: WorkoutPlan) => {
  const ics = generateICS(plan);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${plan.title.replace(/\s+/g, "-")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─── Calendar view ────────────────────────────────────────────────────────────

const PlanCalendarView = ({ plan }: { plan: WorkoutPlan }) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const { startDate, workoutMap, ergDays, strengthDays, restDays } = useMemo(() => {
    const start = plan.created_at ? new Date(plan.created_at) : new Date();
    const map: Record<string, { summary: string; type: string }> = {};
    const erg: Date[] = [];
    const str: Date[] = [];
    const rest: Date[] = [];

    const weeks = extractWorkoutWeeks(plan.workout_data);
    weeks.forEach((week: any, wi: number) => {
      (Array.isArray(week?.days) ? week.days : []).forEach((day: any, di: number) => {
        const d = new Date(start);
        d.setDate(d.getDate() + wi * 7 + di);
        const key = d.toDateString();

        if (day?.is_rest) {
          rest.push(new Date(d));
          map[key] = { summary: "Rest Day", type: "rest" };
        } else if (day?.required?.session_type === "erg") {
          erg.push(new Date(d));
          map[key] = { summary: day.required.title || "Erg workout", type: "erg" };
        } else if (day?.required?.session_type === "lift") {
          str.push(new Date(d));
          map[key] = { summary: day.required.title || "Lift", type: "strength" };
        } else if (day?.ergWorkout) {
          erg.push(new Date(d));
          map[key] = { summary: `${day.ergWorkout?.zone ? "[" + day.ergWorkout.zone + "] " : ""}${day.ergWorkout?.description || "Erg workout"}`, type: "erg" };
        } else if (day?.strengthWorkout) {
          str.push(new Date(d));
          map[key] = { summary: `Strength: ${day.strengthWorkout?.focus || "Workout"}`, type: "strength" };
        } else if (day?.yogaSession) {
          rest.push(new Date(d));
          map[key] = { summary: `Recovery: ${day.yogaSession?.focus || "Rest day"}`, type: "rest" };
        } else if (day?.workout) {
          erg.push(new Date(d));
          map[key] = { summary: String(day.workout).slice(0, 80), type: "erg" };
        }
      });
    });

    return { startDate: start, workoutMap: map, ergDays: erg, strengthDays: str, restDays: rest };
  }, [plan]);

  const selectedWorkout = selectedDate ? workoutMap[selectedDate.toDateString()] : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-xs flex-wrap text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Erg / Cardio</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Strength</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Rest / Recovery</span>
      </div>
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={setSelectedDate}
        defaultMonth={startDate}
        modifiers={{ erg: ergDays, strength: strengthDays, rest: restDays }}
        modifiersClassNames={{
          erg: "!bg-blue-100 !text-blue-800 dark:!bg-blue-900/40 dark:!text-blue-300 font-semibold hover:!bg-blue-200",
          strength: "!bg-orange-100 !text-orange-800 dark:!bg-orange-900/40 dark:!text-orange-300 font-semibold hover:!bg-orange-200",
          rest: "!bg-purple-100 !text-purple-800 dark:!bg-purple-900/40 dark:!text-purple-300 font-semibold hover:!bg-purple-200",
        }}
        className="rounded-md border w-full max-w-full overflow-x-auto"
      />
      {selectedDate && selectedWorkout && (
        <div className="p-3 rounded-lg border bg-muted/30 text-sm space-y-1">
          <p className="font-medium">{selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <p className="text-muted-foreground">{selectedWorkout.summary}</p>
        </div>
      )}
      {selectedDate && !selectedWorkout && (
        <p className="text-sm text-muted-foreground text-center py-2">No workout scheduled for this day</p>
      )}
    </div>
  );
};

// ─── Main section ─────────────────────────────────────────────────────────────

export const WorkoutPlanSection = () => {
  const [showWizard, setShowWizard] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, string[]>>({});
  const [generationProgress, setGenerationProgress] = useState<GenerationProgressState>({ currentBatch: 0, totalBatches: 0 });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<Profile | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const { data: savedPrefs, isLoading: prefsLoading } = useQuery({
    queryKey: ["training-plan-preferences"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase
        .from("training_plan_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: plans, isLoading: plansLoading } = useQuery<WorkoutPlan[]>({
    queryKey: ["workout-plans"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("workout_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as WorkoutPlan[];
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: friends } = useQuery<any[]>({
    queryKey: ["friends-for-sharing"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("friendships")
        .select("*, friend:profiles!friendships_friend_id_fkey(id, full_name, email)")
        .eq("user_id", user.id)
        .eq("status", "accepted");
      return (data || []) as any[];
    },
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["teams-for-sharing"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase.from("teams").select("*").eq("coach_id", user.id);
      return (data || []) as Team[];
    },
  });

  // Show wizard if no saved prefs
  useEffect(() => {
    if (!prefsLoading && !savedPrefs) setShowWizard(true);
  }, [prefsLoading, savedPrefs]);

  const savePrefsAndGenerate = useMutation({
    mutationFn: async (prefs: PlanPreferences & { months: number }) => {
      if (!profile?.weight || !profile?.height) throw new Error("Please complete your profile (weight and height) first");

      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      // Upsert preferences
      await supabase.from("training_plan_preferences").upsert(
        {
          user_id: user.id,
          training_goal: prefs.training_goal,
          intensity: prefs.intensity,
          goal_date: prefs.goal_date,
          include_lifting: prefs.include_lifting,
          lifting_days_per_week: prefs.lifting_days_per_week,
          include_two_a_days: prefs.include_two_a_days,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      const totalWeeks = prefs.months * 4;
      const batches = Math.ceil(totalWeeks / 4);
      setGenerationProgress({ currentBatch: 1, totalBatches: batches });

      const { data: freshGoals } = await supabase.from("user_goals").select("*").eq("user_id", user.id).maybeSingle();

      const { data, error } = await invokeAI("generate-workout", {
        body: {
          user_id: user.id,
          workout_type: "plan",
          preferences: {
            months: prefs.months,
            weight: profile.weight,
            height: profile.height,
            experience: profile.experience_level || "intermediate",
            goals: profile.goals || "general fitness",
            current2k: freshGoals?.current_2k_time ? String(freshGoals.current_2k_time) : null,
            goal2k: freshGoals?.goal_2k_time ? String(freshGoals.goal_2k_time) : null,
            age: profile.age || null,
            healthIssues: profile.health_issues || [],
            // New preference fields
            training_goal: prefs.training_goal,
            intensity: prefs.intensity,
            goal_date: prefs.goal_date,
            include_lifting: prefs.include_lifting,
            lifting_days_per_week: prefs.lifting_days_per_week,
            include_two_a_days: prefs.include_two_a_days,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Validate completeness before saving
      const returnedWeeks = Array.isArray(data?.plan) ? data.plan : (Array.isArray(data) ? data : []);
      if (returnedWeeks.length > 0 && returnedWeeks.length < totalWeeks) {
        throw new Error(`Plan generation incomplete — only ${returnedWeeks.length} of ${totalWeeks} weeks generated. Please try again.`);
      }

      return { data, prefs, user };
    },
    onSuccess: async ({ data, prefs, user }) => {
      setGenerationProgress({ currentBatch: 0, totalBatches: 0 });
      setShowWizard(false);

      const goalLabels: Record<string, string> = {
        general_fitness: "General Fitness",
        erg_testing: "Erg Testing",
        upcoming_race: "Race Training",
        tryouts: "Tryout Prep",
        off_season: "Off Season",
        return_from_injury: "Injury Return",
      };

      const { error } = await supabase.from("workout_plans").insert({
        user_id: user.id,
        title: `${prefs.months}-Month ${goalLabels[prefs.training_goal] || ""} Plan (${prefs.intensity})`,
        description: `${prefs.intensity} intensity plan for ${goalLabels[prefs.training_goal] || "general fitness"}`,
        workout_data: data?.plan ?? data,
      });

      if (error) throw error;

      toast({ title: "Plan Generated", description: "Your personalized training plan is ready!" });
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
      queryClient.invalidateQueries({ queryKey: ["training-plan-preferences"] });
    },
    onError: (error: Error) => {
      setGenerationProgress({ currentBatch: 0, totalBatches: 0 });
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.from("workout_plans").delete().eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plan deleted" });
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
  });

  const sharePlan = useMutation({
    mutationFn: async ({ planId, userId, teamId }: { planId: string; userId?: string; teamId?: string }) => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("plan_shares").insert({
        plan_id: planId,
        shared_by: user.id,
        shared_with_user: userId || null,
        shared_with_team: teamId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => toast({ title: "Plan shared!" }),
    onError: (error: Error) => toast({ title: "Error sharing", description: error.message, variant: "destructive" }),
  });

  const isProfileComplete = !!profile?.weight && !!profile?.height;
  const isCoach = profile?.user_type === "coach";

  const prefsSummary = savedPrefs ? (() => {
    const goalLabels: Record<string, string> = {
      general_fitness: "General Fitness", erg_testing: "Erg Testing",
      upcoming_race: "Upcoming Race", tryouts: "Tryouts",
      off_season: "Off Season", return_from_injury: "Return from Injury",
    };
    return `${goalLabels[savedPrefs.training_goal] || savedPrefs.training_goal} • ${savedPrefs.intensity} intensity${savedPrefs.include_lifting ? ` • Lifting ${savedPrefs.lifting_days_per_week}x/week` : " • No lifting"}`;
  })() : null;

  if (showWizard) {
    return (
      <div className="space-y-6">
        {!isProfileComplete && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
            Please complete your profile (weight and height) in Settings before generating a plan.
          </div>
        )}
        <PlanPreferencesWizard
          onSave={(prefs) => savePrefsAndGenerate.mutate(prefs)}
          initialPrefs={savedPrefs}
        />
        <GenerationProgress
          currentBatch={generationProgress.currentBatch}
          totalBatches={generationProgress.totalBatches}
          isGenerating={savePrefsAndGenerate.isPending}
        />
        {plans && plans.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowWizard(false)}>
            View existing plans
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current preferences summary + regenerate */}
      {savedPrefs && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <p className="text-sm font-medium">Plan preferences saved</p>
                </div>
                <p className="text-xs text-muted-foreground">{prefsSummary}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setShowWizard(true)}>
                  <Settings2 className="h-4 w-4 mr-2" />
                  Change
                </Button>
                <Button
                  size="sm"
                  onClick={() => savePrefsAndGenerate.mutate({
                    training_goal: savedPrefs.training_goal,
                    intensity: savedPrefs.intensity,
                    goal_date: savedPrefs.goal_date,
                    include_lifting: savedPrefs.include_lifting,
                    lifting_days_per_week: savedPrefs.lifting_days_per_week,
                    include_two_a_days: savedPrefs.include_two_a_days,
                    months: 3,
                  })}
                  disabled={savePrefsAndGenerate.isPending || !isProfileComplete}
                >
                  {savePrefsAndGenerate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Generate New Plan
                </Button>
              </div>
            </div>
            <GenerationProgress
              currentBatch={generationProgress.currentBatch}
              totalBatches={generationProgress.totalBatches}
              isGenerating={savePrefsAndGenerate.isPending}
            />
          </CardContent>
        </Card>
      )}

      <SpreadsheetUpload />

      <PlanList
        plans={plans || []}
        plansLoading={plansLoading}
        expandedWeeks={expandedWeeks}
        setExpandedWeeks={setExpandedWeeks}
        friends={friends}
        teams={teams}
        isCoach={isCoach}
        userName={profile?.full_name ?? null}
        onDeletePlan={(planId) => deletePlan.mutate(planId)}
        onSharePlan={(args) => sharePlan.mutate(args)}
      />
    </div>
  );
};
