import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";
import {
  dayDisplayName, formatWeekRange, isLiftSession, isRestDay, phaseBreakdown,
  sessionCooldown, sessionPieces, sessionRate, sessionRest, sessionTargetSplit,
  sessionTitle, sessionWarmup, sessionZone,
} from "@/lib/planSchema";

/**
 * Printable view of a generated plan.
 *
 * This component previously read only the legacy schema — day.type, day.workout,
 * day.rates, day.warmup, day.cooldown and day.ergWorkout. The current generator
 * writes none of those: the session lives at day.required / day.optional. Every
 * cell therefore resolved to "" and the erg-detail section (gated on
 * `days.some(d => d.ergWorkout)`) never rendered, so the whole section printed
 * blank. It now reads the required/optional schema and keeps the legacy fields
 * as a fallback for older uploaded plans.
 */

interface PrintableWeeklyPlanProps {
  /** Week objects, exactly as produced by extractWorkoutWeeks(). */
  weeks: any[];
  title: string;
  userName?: string;
}

const getPhaseColor = (phase?: string): string => {
  const p = phase?.toLowerCase() || "";
  if (p.includes("easy") || p.includes("base")) return "bg-green-100 text-green-800";
  if (p.includes("med") || p.includes("build")) return "bg-blue-100 text-blue-800";
  if (p.includes("hard") || p.includes("peak") || p.includes("race")) return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
};

const getZoneCellColor = (zone?: string | null): string => {
  switch (zone?.toUpperCase()) {
    case "UT2": return "bg-green-100 text-green-900";
    case "UT1": return "bg-blue-100 text-blue-900";
    case "TR": case "TR1": case "TR2": return "bg-yellow-100 text-yellow-900";
    case "AT": return "bg-red-100 text-red-900";
    default: return "";
  }
};

/** The volume line for a day: explicit pieces when present, else the title. */
const workoutLine = (session: any): string => {
  const pieces = sessionPieces(session);
  const title = sessionTitle(session);
  if (pieces && pieces !== title) return `${title} — ${pieces}`;
  return title;
};

/** Warmup / rest / cooldown pairs a session actually supplies. */
const sessionDetail = (session: any): Array<[string, string]> => {
  if (!session) return [];
  const rows: Array<[string, string | null]> = [
    ["Warmup", sessionWarmup(session)],
    ["Rest", sessionRest(session)],
    ["Cooldown", sessionCooldown(session)],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
};

export const PrintableWeeklyPlan = ({ weeks, title, userName }: PrintableWeeklyPlanProps) => {
  const handlePrint = () => window.print();

  if (!weeks || weeks.length === 0) return null;

  const totalWeeks = weeks.length;
  const phases = phaseBreakdown(weeks);

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
          .printable-plan-week-overflow { overflow: visible !important; }
          * { overflow: visible !important; max-height: none !important; }
        }
      `}</style>

      <div className="flex justify-end print:hidden">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print Plan
        </Button>
      </div>

      <div className="print:block" id="printable-plan">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 border-b pb-4">
          <img src={crewsyncLogo} alt="CrewSync" className="h-10 w-auto object-contain" />
          <div className="text-center flex-1 px-4">
            <h1 className="text-xl font-bold">{title}</h1>
            {userName && <p className="text-sm text-muted-foreground mt-1">{userName}</p>}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>CrewSync Training</div>
            <div>{new Date().toLocaleDateString()}</div>
          </div>
        </div>

        {/* Plan summary: total weeks + phase breakdown */}
        <div className="mb-6 printable-plan-week">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-2">
            <h2 className="text-base font-semibold">Plan Summary</h2>
            <span className="text-sm text-muted-foreground">
              {totalWeeks} {totalWeeks === 1 ? "week" : "weeks"}
            </span>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-foreground">
                <th className="p-1 text-left font-bold">Phase</th>
                <th className="p-1 text-left font-bold w-32">Weeks</th>
                <th className="p-1 text-left font-bold w-24">Duration</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((p, i) => (
                <tr key={i} className="border-b border-dashed">
                  <td className={`p-1 ${getPhaseColor(p.phase)}`}>{p.phase}</td>
                  <td className="p-1">{formatWeekRange(p.weekNumbers)}</td>
                  <td className="p-1">
                    {p.weekNumbers.length} {p.weekNumbers.length === 1 ? "week" : "weeks"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* One condensed table per week */}
        {weeks.map((week: any, weekIdx: number) => {
          const days: any[] = Array.isArray(week?.days) ? week.days : [];
          const weekLabel = week?.week ?? weekIdx + 1;
          const phaseLabel = week?.phase ?? "";

          return (
            <div key={weekIdx} className="mb-8 print:mb-6 printable-plan-week">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-bold">Week {weekLabel}</h3>
                {phaseLabel && (
                  <span className={`text-xs px-2 py-0.5 rounded ${getPhaseColor(phaseLabel)}`}>
                    {phaseLabel}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto printable-plan-week-overflow">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-foreground">
                      <th className="p-1 text-left font-bold w-24">Day</th>
                      <th className="p-1 text-left font-bold w-16">Zone</th>
                      <th className="p-1 text-left font-bold">Session</th>
                      <th className="p-1 text-left font-bold w-32">Target</th>
                      <th className="p-1 text-left font-bold w-16">Rate</th>
                      <th className="p-1 text-left font-bold">Optional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-2 text-xs text-muted-foreground text-center">
                          No days in this week
                        </td>
                      </tr>
                    ) : (
                      days.map((day: any, dayIdx: number) => {
                        const name = dayDisplayName(day, dayIdx);
                        const req = day?.required;

                        // Legacy uploaded plans keep their session on the day itself.
                        const legacy = !req ? (day?.ergWorkout ?? null) : null;
                        const session = req ?? legacy;
                        const rest = isRestDay(day) && !session;

                        const zone = session ? sessionZone(session) : null;
                        const lift = session ? isLiftSession(session) : false;
                        const optional = day?.optional;

                        return (
                          <tr key={dayIdx} className="border-b border-dashed align-top">
                            <td className="p-1 font-medium">{name}</td>
                            <td className={`p-1 text-xs ${getZoneCellColor(zone)}`}>
                              {rest ? "—" : lift ? "Lift" : (zone ?? "")}
                            </td>
                            <td className="p-1">
                              {rest ? (
                                <span className="text-muted-foreground">Rest / recovery</span>
                              ) : session ? (
                                <>
                                  <div>{workoutLine(session)}</div>
                                  {session.description && session.description !== session.title && (
                                    <div className="text-xs text-muted-foreground">{session.description}</div>
                                  )}
                                </>
                              ) : typeof day?.workout === "string" ? (
                                day.workout
                              ) : (
                                ""
                              )}
                            </td>
                            <td className="p-1 text-xs">{session ? (sessionTargetSplit(session) ?? "") : ""}</td>
                            <td className="p-1 text-xs">{session ? (sessionRate(session) ?? "") : ""}</td>
                            <td className="p-1 text-xs text-muted-foreground">
                              {optional ? sessionTitle(optional) : ""}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Warmup / rest / cooldown detail, only where the plan supplies it */}
              {days.some((d: any) => sessionDetail(d?.required).length > 0) && (
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 print:grid-cols-4">
                  {days.map((day: any, dayIdx: number) => {
                    const detail = sessionDetail(day?.required);
                    if (detail.length === 0) return null;
                    const zone = sessionZone(day.required);
                    return (
                      <div key={dayIdx} className="p-2 rounded border text-xs space-y-0.5">
                        <div className="font-semibold">
                          {dayDisplayName(day, dayIdx)}{zone ? ` — ${zone}` : ""}
                        </div>
                        {detail.map(([label, text]) => (
                          <div key={label}><span className="font-medium">{label}:</span> {text}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="print:block hidden mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
          Generated by CrewSync · crewsync.app
        </div>
      </div>
    </div>
  );
};
