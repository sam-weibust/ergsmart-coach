import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

// Handles both new schema (day: number 1-7) and old schema (day: string "Monday")
interface WorkoutDay {
  day: number | string;
  type?: string;
  warmup?: string;
  workout?: string;
  rest?: string;
  breakup?: string;
  rates?: string;
  cooldown?: string;
  notes?: string;
  ergWorkout?: {
    zone?: string;
    description?: string;
    distance?: string;
    duration?: string;
    targetSplit?: string;
    rate?: string;
    warmup?: string;
    cooldown?: string;
    restPeriods?: string;
  } | null;
}

interface WorkoutWeek {
  week?: number;
  phase?: string;
  startDate?: string;
  days?: WorkoutDay[];
}

interface PrintableWeeklyPlanProps {
  weeks: WorkoutWeek[];
  title: string;
  userName?: string;
}

const DAY_NUMBER_MAP: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const getDayLabel = (dayNum: number): string => {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return days[(dayNum - 1) % 7] || "?";
};

const getDayName = (dayNum: number): string => {
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  return days[(dayNum - 1) % 7] || `Day ${dayNum}`;
};

const getPhaseColor = (phase?: string): string => {
  const p = phase?.toLowerCase() || "";
  if (p.includes("easy") || p.includes("base")) return "bg-green-100 text-green-800";
  if (p.includes("med") || p.includes("build")) return "bg-blue-100 text-blue-800";
  if (p.includes("hard") || p.includes("peak")) return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
};

const getTypeColor = (type?: string): string => {
  const t = type?.toUpperCase() || "";
  if (t === "UT1") return "bg-blue-200";
  if (t === "UT2") return "bg-green-200";
  if (t === "LIFT") return "bg-purple-200";
  if (t === "REST" || t === "OFF") return "bg-gray-100";
  return "bg-yellow-100";
};

/**
 * Resolves a WorkoutDay's canonical day number (1-7).
 * - New schema: day is already a number.
 * - Old schema: day is a string like "Monday" — looked up in map, or falls back to index.
 */
const resolveDayNumber = (day: WorkoutDay, fallbackIndex: number): number => {
  if (typeof day.day === "number") return day.day;
  if (typeof day.day === "string") {
    const mapped = DAY_NUMBER_MAP[day.day.toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  // Fallback: use position in array (1-based)
  return (fallbackIndex % 7) + 1;
};

export const PrintableWeeklyPlan = ({
  weeks,
  title,
  userName,
}: PrintableWeeklyPlanProps) => {
  const handlePrint = () => {
    window.print();
  };

  if (!weeks || weeks.length === 0) return null;

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-plan, #printable-plan * { visibility: visible; }
          #printable-plan {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            overflow: visible !important;
            max-height: none !important;
          }
          .no-print, .print\\:hidden { display: none !important; }
          .printable-plan-week {
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: 1.5rem;
          }
          .printable-plan-week-overflow {
            overflow: visible !important;
          }
          /* Ensure any ancestor overflow constraints are lifted */
          * {
            overflow: visible !important;
            max-height: none !important;
          }
        }
      `}</style>

      <div className="flex justify-end print:hidden">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print Plan
        </Button>
      </div>

      <div className="print:block" id="printable-plan">
        {/* Print Header */}
        <div className="flex items-center justify-between mb-6 print:mb-4 border-b pb-4">
          <img
            src={crewsyncLogo}
            alt="CrewSync"
            className="h-10 w-auto object-contain"
          />
          <div className="text-center flex-1 px-4">
            <h1 className="text-xl font-bold">{title}</h1>
            {userName && (
              <p className="text-sm text-muted-foreground mt-1">{userName}</p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>CrewSync Training</div>
            <div>{new Date().toLocaleDateString()}</div>
          </div>
        </div>

        {weeks.map((week, weekIdx) => {
          // Always treat days as potentially undefined/null
          const rawDays: WorkoutDay[] = Array.isArray(week.days) ? week.days : [];

          // Build a map of dayNumber -> WorkoutDay, resolving both schema types
          const dayMap = new Map<number, WorkoutDay>();
          rawDays.forEach((d, idx) => {
            const num = resolveDayNumber(d, idx);
            dayMap.set(num, d);
          });

          const findDay = (d: number): WorkoutDay | undefined => dayMap.get(d);
          const weekLabel = week.week ?? weekIdx + 1;
          const phaseLabel = week.phase ?? "";

          return (
            <div
              key={weekIdx}
              className="mb-8 print:mb-6 printable-plan-week"
            >
              {/* Weekly grid table */}
              <div className="overflow-x-auto printable-plan-week-overflow">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-foreground">
                      <th className="p-1 text-left w-20"></th>
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <th
                          key={d}
                          className="p-1 text-center font-bold min-w-[100px]"
                        >
                          {getDayLabel(d)}
                        </th>
                      ))}
                      <th
                        className={`p-1 text-center font-bold w-16 ${getPhaseColor(phaseLabel)}`}
                      >
                        {phaseLabel}
                      </th>
                    </tr>
                    <tr className="border-b">
                      <th className="p-1 text-left text-xs text-muted-foreground">
                        Week {weekLabel}
                      </th>
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                        const day = findDay(d);
                        return (
                          <th
                            key={d}
                            className={`p-1 text-center text-xs ${
                              day?.type ? getTypeColor(day.type) : ""
                            }`}
                          >
                            {week.startDate || ""}
                          </th>
                        );
                      })}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        "Type",
                        "Warmup",
                        "Workout",
                        "Rest",
                        "Breakup",
                        "Rates",
                        "Cooldown",
                      ] as const
                    ).map((rowLabel, rowIdx) => {
                      const field = rowLabel.toLowerCase() as keyof WorkoutDay;
                      const isLast = rowIdx === 6;
                      return (
                        <tr
                          key={rowLabel}
                          className={
                            isLast ? "border-b" : "border-b border-dashed"
                          }
                        >
                          <td className="p-1 text-xs font-medium">
                            {rowLabel}
                          </td>
                          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                            const day = findDay(d);
                            let cellVal = "";
                            if (rowLabel === "Type") {
                              cellVal =
                                day?.type ?? day?.ergWorkout?.zone ?? "";
                            } else if (rowLabel === "Workout") {
                              cellVal =
                                day?.workout ??
                                day?.ergWorkout?.description ??
                                "";
                            } else if (rowLabel === "Rates") {
                              cellVal =
                                day?.rates ?? day?.ergWorkout?.rate ?? "";
                            } else if (rowLabel === "Warmup") {
                              cellVal =
                                day?.warmup ??
                                day?.ergWorkout?.warmup ??
                                "";
                            } else if (rowLabel === "Cooldown") {
                              cellVal =
                                day?.cooldown ??
                                day?.ergWorkout?.cooldown ??
                                "";
                            } else {
                              const raw = day?.[field];
                              cellVal =
                                typeof raw === "string" ? raw : "";
                            }
                            return (
                              <td
                                key={d}
                                className={`p-1 text-center text-xs ${
                                  rowLabel === "Type" && day?.type
                                    ? getTypeColor(day.type)
                                    : ""
                                }`}
                              >
                                {cellVal}
                              </td>
                            );
                          })}
                          <td></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Erg details section — days with ergWorkout data */}
              {rawDays.some((d) => d.ergWorkout) && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 print:grid-cols-4">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                    const day = findDay(d);
                    const ew = day?.ergWorkout;
                    if (!ew) return null;
                    return (
                      <div
                        key={d}
                        className={`p-2 rounded border text-xs space-y-0.5 ${getTypeColor(
                          day?.type
                        )}`}
                      >
                        <div className="font-semibold">
                          {getDayName(d)} — {ew?.zone ?? day?.type ?? ""}
                        </div>
                        {ew?.description && (
                          <div className="text-muted-foreground">
                            {ew.description}
                          </div>
                        )}
                        {ew?.distance && (
                          <div>
                            <span className="font-medium">Dist:</span>{" "}
                            {ew.distance}m
                          </div>
                        )}
                        {ew?.duration && (
                          <div>
                            <span className="font-medium">Dur:</span>{" "}
                            {ew.duration}
                          </div>
                        )}
                        {ew?.targetSplit && (
                          <div>
                            <span className="font-medium">Split:</span>{" "}
                            {ew.targetSplit}
                          </div>
                        )}
                        {ew?.rate && (
                          <div>
                            <span className="font-medium">Rate:</span>{" "}
                            {ew.rate}
                          </div>
                        )}
                        {ew?.restPeriods && (
                          <div>
                            <span className="font-medium">Rest:</span>{" "}
                            {ew.restPeriods}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Print footer */}
        <div className="print:block hidden mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
          Generated by CrewSync · crewsync.app
        </div>
      </div>
    </div>
  );
};
