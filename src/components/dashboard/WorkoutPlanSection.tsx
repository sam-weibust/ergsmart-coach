import { useEffect, useMemo, useState } from "react";
import { getSessionUser } from '@/lib/getUser';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Dumbbell,
  FileImage,
  Loader2,
  Printer,
  Share2,
  Utensils,
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

type UserGoals = {
  current_2k_time?: number | null;
  goal_2k_time?: number | null;
};

type WorkoutPlan = {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  workout_data: any;
  created_at?: string;
};

type Friend = {
  id: string;
  friend: {
    id: string;
    full_name?: string | null;
    email?: string | null;
  };
};

type Team = {
  id: string;
  name: string;
  level?: string | null;
};

type GenerationProgressState = {
  currentBatch: number;
  totalBatches: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely extract the weeks array from workout_data.
 * Handles:
 *  - Already an array                  → use as-is
 *  - Object with .plan array           → use .plan
 *  - Object with .weeks array          → use .weeks
 *  - Anything else / null / undefined  → []
 */
const extractWorkoutWeeks = (workout_data: any): any[] => {
  if (!workout_data) return [];
  if (Array.isArray(workout_data)) return workout_data;
  if (Array.isArray(workout_data?.plan)) return workout_data.plan;
  if (Array.isArray(workout_data?.weeks)) return workout_data.weeks;
  return [];
};

const getZoneColor = (zone?: string) => {
  switch (zone?.toUpperCase()) {
    case "UT2":
      return "bg-green-500/20 text-green-700 border-green-500/30";
    case "UT1":
      return "bg-blue-500/20 text-blue-700 border-blue-500/30";
    case "TR":
      return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
    case "AT":
      return "bg-red-500/20 text-red-700 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type GeneratePlanControlsProps = {
  months: string;
  setMonths: (value: string) => void;
  isProfileComplete: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  generationProgress: GenerationProgressState;
};

const GeneratePlanControls = ({
  months,
  setMonths,
  isProfileComplete,
  isGenerating,
  onGenerate,
  generationProgress,
}: GeneratePlanControlsProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Generate Training Plan</CardTitle>
      <CardDescription>
        Create a periodized rowing program with progressive speed training, full
        strength workouts, and meal plans
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!isProfileComplete && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-700 dark:text-yellow-400">
          Please complete your profile (weight and height) in the Profile tab
          before generating a plan.
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className={getZoneColor("UT2")}>
          UT2: Base endurance
        </Badge>
        <Badge variant="outline" className={getZoneColor("UT1")}>
          UT1: Aerobic development
        </Badge>
        <Badge variant="outline" className={getZoneColor("TR")}>
          TR: Threshold
        </Badge>
        <Badge variant="outline" className={getZoneColor("AT")}>
          AT: High intensity
        </Badge>
      </div>

      <div className="flex gap-4">
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
        <Button
          onClick={onGenerate}
          disabled={isGenerating || !isProfileComplete}
        >
          {isGenerating && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Generate Plan
        </Button>
      </div>

      <GenerationProgress
        currentBatch={generationProgress.currentBatch}
        totalBatches={generationProgress.totalBatches}
        isGenerating={isGenerating}
      />
    </CardContent>
  </Card>
);

type ErgBlockProps = {
  ergWorkout: any;
};

const ErgBlock = ({ ergWorkout }: ErgBlockProps) => {
  if (!ergWorkout) return null;

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Badge
        variant="outline"
        className={getZoneColor(ergWorkout?.zone)}
      >
        {ergWorkout?.zone || "Erg"}
      </Badge>
      <div className="flex-1">
        <div className="font-medium">
          {ergWorkout?.description || "Workout"}
        </div>
        <div className="text-sm text-muted-foreground">
          {ergWorkout?.duration && `${ergWorkout.duration}`}
          {ergWorkout?.distance && ` • ${ergWorkout.distance}m`}
          {ergWorkout?.targetSplit &&
            ` • Target: ${ergWorkout.targetSplit}`}
          {ergWorkout?.rate && ` • ${ergWorkout.rate}`}
        </div>
        {ergWorkout?.warmup && (
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">
            🔥 Warmup: {ergWorkout.warmup}
          </div>
        )}
        {ergWorkout?.restPeriods && (
          <div className="text-xs text-yellow-600 dark:text-yellow-400">
            ⏱ Rest: {ergWorkout.restPeriods}
          </div>
        )}
        {ergWorkout?.cooldown && (
          <div className="text-xs text-blue-600 dark:text-blue-400">
            ❄️ Cooldown: {ergWorkout.cooldown}
          </div>
        )}
        {ergWorkout?.notes && (
          <div className="text-xs text-muted-foreground italic mt-1">
            {ergWorkout.notes}
          </div>
        )}
      </div>
    </div>
  );
};

type StrengthBlockProps = {
  strengthWorkout: any;
};

const StrengthBlock = ({ strengthWorkout }: StrengthBlockProps) => {
  if (!strengthWorkout) return null;

  const hasArrayExercises =
    Array.isArray(strengthWorkout.exercises) &&
    strengthWorkout.exercises.length > 0;

  return (
    <div className="border-l-2 border-primary/30 pl-3">
      <div className="flex items-center gap-2 mb-2">
        <Dumbbell className="h-4 w-4 text-primary" />
        <span className="font-medium">
          Strength: {strengthWorkout.focus || "Full Body"}
        </span>
      </div>

      {strengthWorkout.warmupNotes && (
        <div className="text-xs text-green-600 dark:text-green-400 mb-1">
          🔥 Warmup: {strengthWorkout.warmupNotes}
        </div>
      )}

      {hasArrayExercises ? (
        <div className="grid gap-1 text-sm">
          {strengthWorkout.exercises.map((ex: any, idx: number) => (
            <div key={idx} className="flex justify-between">
              <span>{ex?.exercise || ex?.name || "Exercise"}</span>
              <span className="text-muted-foreground">
                {ex?.sets ?? 0}x{ex?.reps ?? 0}
                {ex?.weight && ` @ ${ex.weight}`}
                {ex?.restBetweenSets && ` (${ex.restBetweenSets} rest)`}
                {ex?.rest && !ex.restBetweenSets && ` (Rest: ${ex.rest})`}
              </span>
            </div>
          ))}
        </div>
      ) : strengthWorkout.exercise ? (
        <span className="text-sm">
          {strengthWorkout.exercise} -{" "}
          {strengthWorkout.sets ?? 0}x{strengthWorkout.reps ?? 0}
          {strengthWorkout.weight && ` @ ${strengthWorkout.weight}`}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">
          No exercises listed
        </span>
      )}

      {strengthWorkout.cooldownNotes && (
        <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
          ❄️ Cooldown: {strengthWorkout.cooldownNotes}
        </div>
      )}

      {strengthWorkout.notes && (
        <div className="text-xs text-muted-foreground italic mt-1">
          {strengthWorkout.notes}
        </div>
      )}
    </div>
  );
};

type YogaBlockProps = {
  yogaSession: any;
};

const YogaBlock = ({ yogaSession }: YogaBlockProps) => {
  if (!yogaSession) return null;

  return (
    <div className="border-l-2 border-purple-500/30 pl-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-purple-600">🧘</span>
        <span className="font-medium">Rest Day - Yoga/Recovery</span>
        {yogaSession.duration && (
          <Badge variant="secondary" className="text-xs">
            {yogaSession.duration}
          </Badge>
        )}
      </div>
      {yogaSession.focus && (
        <div className="text-sm">
          <span className="font-medium">Focus:</span> {yogaSession.focus}
        </div>
      )}
      {yogaSession.poses && (
        <div className="text-sm text-muted-foreground">{yogaSession.poses}</div>
      )}
    </div>
  );
};

type MealBlockProps = {
  mealPlan: any;
};

const MealBlock = ({ mealPlan }: MealBlockProps) => {
  if (!mealPlan) return null;

  return (
    <div className="border-l-2 border-secondary/30 pl-3">
      <div className="flex items-center gap-2 mb-2">
        <Utensils className="h-4 w-4 text-secondary" />
        <span className="font-medium">Meal Plan</span>
        {mealPlan.totalCalories && (
          <Badge variant="secondary" className="text-xs">
            {mealPlan.totalCalories} cal
          </Badge>
        )}
      </div>
      <div className="grid gap-1 text-sm">
        {mealPlan.breakfast && (
          <div>
            <span className="font-medium">Breakfast:</span> {mealPlan.breakfast}
          </div>
        )}
        {mealPlan.lunch && (
          <div>
            <span className="font-medium">Lunch:</span> {mealPlan.lunch}
          </div>
        )}
        {mealPlan.dinner && (
          <div>
            <span className="font-medium">Dinner:</span> {mealPlan.dinner}
          </div>
        )}
        {mealPlan.snacks && (
          <div>
            <span className="font-medium">Snacks:</span> {mealPlan.snacks}
          </div>
        )}
        {mealPlan.macros && (
          <div className="text-xs text-muted-foreground mt-1">
            Macros: {mealPlan.macros}
          </div>
        )}
      </div>
    </div>
  );
};

type DayCardProps = {
  day: any;
  dayIndex: number;
};

const DayCard = ({ day, dayIndex }: DayCardProps) => {
  // Old schema: day.day is a string like "Monday", new schema: day.day is a number
  const dayLabel =
    typeof day?.day === "string"
      ? day.day
      : `Day ${day?.day ?? dayIndex + 1}`;

  // Old schema only has a plain workout string; new schema has structured fields.
  // Show the plain workout string when present (covers old schema).
  const hasPlainWorkout = typeof day?.workout === "string" && day.workout.length > 0;
  // New schema structured fields
  const hasStructured =
    !hasPlainWorkout &&
    (day?.ergWorkout || day?.strengthWorkout || day?.yogaSession || day?.mealPlan);

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="font-medium text-lg">{dayLabel}</div>

      {hasPlainWorkout && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {day.workout}
        </p>
      )}

      {hasStructured && (
        <>
          {day.ergWorkout && <ErgBlock ergWorkout={day.ergWorkout} />}
          {day.strengthWorkout && (
            <StrengthBlock strengthWorkout={day.strengthWorkout} />
          )}
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

const WeekAccordion = ({
  planId,
  weeks,
  expandedWeeks,
  setExpandedWeeks,
}: WeekAccordionProps) => (
  <Accordion
    type="multiple"
    value={expandedWeeks}
    onValueChange={setExpandedWeeks}
    className="w-full"
  >
    {weeks.map((week: any, weekIdx: number) => (
      <AccordionItem key={weekIdx} value={`week-${weekIdx}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">
              Week {week?.week ?? weekIdx + 1}
            </h4>
            {week?.phase && (
              <Badge variant="outline" className="text-xs">
                {week.phase}
              </Badge>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-3">
            {Array.isArray(week?.days) && week.days.length > 0 ? (
              week.days.map((day: any, dayIdx: number) => (
                <DayCard
                  key={day?.day ?? dayIdx}
                  day={day}
                  dayIndex={dayIdx}
                />
              ))
            ) : (
              <div className="text-muted-foreground text-sm">
                No days in this week
              </div>
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

const SharePlanDialog = ({
  planId,
  friends,
  teams,
  isCoach,
  onShare,
}: SharePlanDialogProps) => {
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
        <DialogHeader>
          <DialogTitle>Share Training Plan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {hasFriends && (
            <div>
              <h4 className="font-medium mb-2">Share with Friend</h4>
              <div className="space-y-2">
                {friends!.map((f) => (
                  <Button
                    key={f.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => onShare({ planId, userId: f.friend.id })}
                  >
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
                  <Button
                    key={team.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => onShare({ planId, teamId: team.id })}
                  >
                    {team.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {!hasFriends && !hasTeams && (
            <p className="text-muted-foreground text-center py-4">
              Add friends or create teams to share plans
            </p>
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
  setExpandedWeeks: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
  friends: Friend[] | undefined;
  teams: Team[] | undefined;
  isCoach: boolean;
  userName?: string | null;
  onDeletePlan: (planId: string) => void;
  onSharePlan: (args: {
    planId: string;
    userId?: string;
    teamId?: string;
  }) => void;
};

const PlanList = ({
  plans,
  plansLoading,
  expandedWeeks,
  setExpandedWeeks,
  friends,
  teams,
  isCoach,
  userName,
  onDeletePlan,
  onSharePlan,
}: PlanListProps) => {
  // ALL hooks must be called unconditionally before any early returns
  const [calendarPlanIds, setCalendarPlanIds] = useState<Set<string>>(
    new Set()
  );

  if (plansLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Training Plans</CardTitle>
        </CardHeader>
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
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const toggleAllWeeks = (planId: string, weeks: any[]) => {
    const weekIds = weeks.map((_: any, idx: number) => `week-${idx}`);
    const currentExpanded = expandedWeeks[planId] || [];
    const allExpanded =
      weeks.length > 0 && currentExpanded.length === weeks.length;

    setExpandedWeeks((prev) => ({
      ...prev,
      [planId]: allExpanded ? [] : weekIds,
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Training Plans</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {plans.map((plan) => {
            // Safely extract weeks array from any workout_data shape
            const workoutWeeks = extractWorkoutWeeks(plan.workout_data);
            const planExpandedWeeks = expandedWeeks[plan.id] || [];
            const allExpanded =
              workoutWeeks.length > 0 &&
              planExpandedWeeks.length === workoutWeeks.length;

            return (
              <AccordionItem key={plan.id} value={plan.id}>
                <AccordionTrigger>
                  <div className="flex justify-between w-full pr-4">
                    <span>{plan.title}</span>
                    <span className="text-sm text-muted-foreground">
                      {plan.created_at
                        ? new Date(plan.created_at).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {/* Removed max-h/overflow-y-auto so the plan is never clipped
                      (including in print view). Use space-y-4 for layout only. */}
                  <div className="space-y-4">
                    {workoutWeeks.length > 0 &&
                      workoutWeeks[0]?.fileUrl && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FileImage className="h-4 w-4" />
                            <span>
                              Uploaded: {workoutWeeks[0]?.fileName}
                            </span>
                          </div>
                          {workoutWeeks[0]?.fileType === "pdf" ? (
                            <iframe
                              src={workoutWeeks[0].fileUrl}
                              className="w-full h-[500px] border rounded-lg"
                              title="Workout Plan PDF"
                            />
                          ) : (
                            <img
                              src={workoutWeeks[0].fileUrl}
                              alt="Workout Plan"
                              className="w-full rounded-lg border"
                            />
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              window.open(workoutWeeks[0].fileUrl, "_blank")
                            }
                          >
                            <Printer className="h-4 w-4 mr-2" />
                            Open in New Tab / Print
                          </Button>
                        </div>
                      )}

                    {workoutWeeks.length > 0 &&
                      !workoutWeeks[0]?.fileUrl && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleCalendarView(plan.id)}
                          >
                            <CalendarDays className="h-4 w-4 mr-2" />
                            {calendarPlanIds.has(plan.id)
                              ? "List View"
                              : "Calendar View"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadICS(plan)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Export .ics
                          </Button>
                        </div>
                      )}

                    {workoutWeeks.length > 0 &&
                      !workoutWeeks[0]?.fileUrl &&
                      calendarPlanIds.has(plan.id) && (
                        <PlanCalendarView plan={plan} />
                      )}

                    {workoutWeeks.length > 0 &&
                      !workoutWeeks[0]?.fileUrl &&
                      !calendarPlanIds.has(plan.id) && (
                        <PrintableWeeklyPlan
                          weeks={workoutWeeks}
                          title={plan.title}
                          userName={userName ?? undefined}
                        />
                      )}

                    {workoutWeeks.length > 0 &&
                      !workoutWeeks[0]?.fileUrl &&
                      !calendarPlanIds.has(plan.id) && (
                        <div className="flex justify-end mb-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              toggleAllWeeks(plan.id, workoutWeeks)
                            }
                          >
                            {allExpanded ? (
                              <>
                                <ChevronUp className="h-4 w-4 mr-1" />
                                Collapse All Weeks
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4 mr-1" />
                                Expand All Weeks
                              </>
                            )}
                          </Button>
                        </div>
                      )}

                    {!calendarPlanIds.has(plan.id) &&
                      (workoutWeeks.length > 0 ? (
                        <WeekAccordion
                          planId={plan.id}
                          weeks={workoutWeeks}
                          expandedWeeks={planExpandedWeeks}
                          setExpandedWeeks={(values) =>
                            setExpandedWeeks((prev) => ({
                              ...prev,
                              [plan.id]: values,
                            }))
                          }
                        />
                      ) : (
                        <div className="text-muted-foreground p-4 text-center">
                          {plan.workout_data
                            ? "Unable to display workout data"
                            : "No workout data available"}
                        </div>
                      ))}

                    <div className="flex flex-wrap gap-2 pt-4 border-t">
                      <SharePlanDialog
                        planId={plan.id}
                        friends={friends}
                        teams={teams}
                        isCoach={isCoach}
                        onShare={onSharePlan}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadICS(plan)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export .ics
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onDeletePlan(plan.id)}
                      >
                        Delete Plan
                      </Button>
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

const sanitizeICS = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const generateICS = (plan: WorkoutPlan): string => {
  const startDate = plan.created_at ? new Date(plan.created_at) : new Date();
  const weeks = extractWorkoutWeeks(plan.workout_data);
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

  const events = weeks.flatMap((week: any, wi: number) =>
    (Array.isArray(week?.days) ? week.days : []).map(
      (day: any, di: number) => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + wi * 7 + di);
        const dateStr = fmtDate(d);

        const summary = day?.ergWorkout
          ? `${day.ergWorkout?.zone ? day.ergWorkout.zone + ": " : ""}${day.ergWorkout?.description || "Erg Workout"}`
          : day?.strengthWorkout
          ? `Strength: ${day.strengthWorkout?.focus || "Workout"}`
          : day?.yogaSession
          ? "Rest / Recovery"
          : day?.workout
          ? String(day.workout).slice(0, 60)
          : "Training Day";

        const description =
          day?.workout ||
          day?.ergWorkout?.description ||
          (day?.strengthWorkout
            ? `${day.strengthWorkout?.focus || "Strength"} training`
            : "") ||
          (day?.yogaSession
            ? `Recovery: ${day.yogaSession?.focus || ""}`
            : "") ||
          "";

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
      }
    )
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

  const { startDate, workoutMap, ergDays, strengthDays, restDays } =
    useMemo(() => {
      const start = plan.created_at ? new Date(plan.created_at) : new Date();
      const map: Record<string, { summary: string; type: string }> = {};
      const erg: Date[] = [];
      const str: Date[] = [];
      const rest: Date[] = [];

      const weeks = extractWorkoutWeeks(plan.workout_data);
      weeks.forEach((week: any, wi: number) => {
        (Array.isArray(week?.days) ? week.days : []).forEach(
          (day: any, di: number) => {
            const d = new Date(start);
            d.setDate(d.getDate() + wi * 7 + di);
            const key = d.toDateString();

            if (day?.ergWorkout) {
              erg.push(new Date(d));
              map[key] = {
                summary: `${day.ergWorkout?.zone ? "[" + day.ergWorkout.zone + "] " : ""}${day.ergWorkout?.description || "Erg workout"}`,
                type: "erg",
              };
            } else if (day?.strengthWorkout) {
              str.push(new Date(d));
              map[key] = {
                summary: `Strength: ${day.strengthWorkout?.focus || "Workout"}`,
                type: "strength",
              };
            } else if (day?.yogaSession) {
              rest.push(new Date(d));
              map[key] = {
                summary: `Recovery: ${day.yogaSession?.focus || "Rest day"}`,
                type: "rest",
              };
            } else if (day?.workout) {
              erg.push(new Date(d));
              map[key] = {
                summary: String(day.workout).slice(0, 80),
                type: "erg",
              };
            }
          }
        );
      });

      return {
        startDate: start,
        workoutMap: map,
        ergDays: erg,
        strengthDays: str,
        restDays: rest,
      };
    }, [plan]);

  const selectedWorkout = selectedDate
    ? workoutMap[selectedDate.toDateString()]
    : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-xs flex-wrap text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />{" "}
          Erg / Cardio
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />{" "}
          Strength
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />{" "}
          Rest / Recovery
        </span>
      </div>

      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={setSelectedDate}
        defaultMonth={startDate}
        modifiers={{ erg: ergDays, strength: strengthDays, rest: restDays }}
        modifiersClassNames={{
          erg: "!bg-blue-100 !text-blue-800 dark:!bg-blue-900/40 dark:!text-blue-300 font-semibold hover:!bg-blue-200",
          strength:
            "!bg-orange-100 !text-orange-800 dark:!bg-orange-900/40 dark:!text-orange-300 font-semibold hover:!bg-orange-200",
          rest: "!bg-purple-100 !text-purple-800 dark:!bg-purple-900/40 dark:!text-purple-300 font-semibold hover:!bg-purple-200",
        }}
        className="rounded-md border w-fit"
      />

      {selectedDate && selectedWorkout && (
        <div className="p-3 rounded-lg border bg-muted/30 text-sm space-y-1">
          <p className="font-medium">
            {selectedDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <p className="text-muted-foreground">{selectedWorkout.summary}</p>
        </div>
      )}
      {selectedDate && !selectedWorkout && (
        <p className="text-sm text-muted-foreground text-center py-2">
          No workout scheduled for this day
        </p>
      )}
    </div>
  );
};

// ─── Main section ─────────────────────────────────────────────────────────────

export const WorkoutPlanSection = () => {
  // ALL hooks unconditionally at the top
  const [months, setMonths] = useState<string>("3");
  const [expandedWeeks, setExpandedWeeks] = useState<
    Record<string, string[]>
  >({});
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgressState>({
      currentBatch: 0,
      totalBatches: 0,
    });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<Profile | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data as Profile | null;
    },
  });

  useQuery<UserGoals | null>({
    queryKey: ["user-goals"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && (error as any).code !== "PGRST116") throw error;
      return data as UserGoals | null;
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
  });

  const { data: friends } = useQuery<Friend[]>({
    queryKey: ["friends-for-sharing"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];

      const { data } = await supabase
        .from("friendships")
        .select(
          "*, friend:profiles!friendships_friend_id_fkey(id, full_name, email)"
        )
        .eq("user_id", user.id)
        .eq("status", "accepted");

      return (data || []) as Friend[];
    },
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["teams-for-sharing"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];

      const { data } = await supabase
        .from("teams")
        .select("*")
        .eq("coach_id", user.id);

      return (data || []) as Team[];
    },
  });

  useEffect(() => {
    const totalWeeks = parseInt(months) * 4;
    const totalBatches = Math.ceil(totalWeeks / 4);

    setGenerationProgress((prev) => ({
      ...prev,
      totalBatches,
    }));
  }, [months]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (
      generationProgress.totalBatches > 0 &&
      generationProgress.currentBatch < generationProgress.totalBatches
    ) {
      interval = setInterval(() => {
        setGenerationProgress((prev) => {
          if (prev.currentBatch < prev.totalBatches) {
            return { ...prev, currentBatch: prev.currentBatch + 1 };
          }
          return prev;
        });
      }, 25000);
    }
    return () => clearInterval(interval);
  }, [generationProgress.totalBatches, generationProgress.currentBatch]);

  const generatePlan = useMutation({
    mutationFn: async () => {
      if (!profile?.weight || !profile?.height) {
        throw new Error("Please complete your profile first");
      }

      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      const { data: freshGoals } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const numWeeks = parseInt(months) * 4;
      const batches = Math.ceil(numWeeks / 4);
      setGenerationProgress({ currentBatch: 1, totalBatches: batches });

      const { data, error } = await supabase.functions.invoke(
        "generate-workout",
        {
          body: {
            user_id: user.id,
            workout_type: "plan",
            preferences: {
              months: parseInt(months),
              weight: profile.weight,
              height: profile.height,
              experience: profile.experience_level || "intermediate",
              goals: profile.goals || "general fitness",
              current2k: freshGoals?.current_2k_time
                ? String(freshGoals.current_2k_time)
                : null,
              goal2k: freshGoals?.goal_2k_time
                ? String(freshGoals.goal_2k_time)
                : null,
              age: profile.age || null,
              healthIssues: profile.health_issues || [],
            },
          },
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: async (data: any) => {
      setGenerationProgress({ currentBatch: 0, totalBatches: 0 });

      const user = await getSessionUser();
      if (!user) return;

      const { error } = await supabase.from("workout_plans").insert({
        user_id: user.id,
        title: `${months}-Month Training Plan`,
        description: `Generated plan for ${profile?.goals || "general fitness"}`,
        workout_data: data?.plan ?? data,
      });

      if (error) throw error;

      toast({
        title: "Workout Plan Generated",
        description: `Your ${months}-month plan is ready!`,
      });

      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
    onError: (error: Error) => {
      setGenerationProgress({ currentBatch: 0, totalBatches: 0 });
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase
        .from("workout_plans")
        .delete()
        .eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Plan deleted" });
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
  });

  const sharePlan = useMutation({
    mutationFn: async ({
      planId,
      userId,
      teamId,
    }: {
      planId: string;
      userId?: string;
      teamId?: string;
    }) => {
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
    onSuccess: () => {
      toast({ title: "Plan shared!" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error sharing",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isProfileComplete = !!profile?.weight && !!profile?.height;
  const isCoach = profile?.user_type === "coach";

  return (
    <div className="space-y-6">
      <GeneratePlanControls
        months={months}
        setMonths={setMonths}
        isProfileComplete={isProfileComplete}
        isGenerating={generatePlan.isPending}
        onGenerate={() => generatePlan.mutate()}
        generationProgress={generationProgress}
      />

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
