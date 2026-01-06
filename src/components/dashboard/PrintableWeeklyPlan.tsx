import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface WorkoutDay {
  day: number;
  type?: string;
  warmup?: string;
  workout?: string;
  rest?: string;
  breakup?: string;
  rates?: string;
  cooldown?: string;
  notes?: string;
  ergWorkout?: {
    zone: string;
    description: string;
    duration?: string;
    rate?: string;
  };
}

interface WorkoutWeek {
  week: number;
  phase: string;
  startDate?: string;
  days: WorkoutDay[];
}

interface PrintableWeeklyPlanProps {
  weeks: WorkoutWeek[];
  title: string;
}

const getDayLabel = (dayNum: number): string => {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return days[(dayNum - 1) % 7] || "?";
};

const getPhaseColor = (phase: string): string => {
  const p = phase?.toLowerCase() || "";
  if (p.includes("easy") || p.includes("base")) return "bg-green-100 text-green-800";
  if (p.includes("med") || p.includes("build")) return "bg-blue-100 text-blue-800";
  if (p.includes("hard") || p.includes("peak")) return "bg-red-100 text-red-800";
  return "bg-muted text-muted-foreground";
};

const getTypeColor = (type: string): string => {
  const t = type?.toUpperCase() || "";
  if (t === "UT1") return "bg-blue-200";
  if (t === "UT2") return "bg-green-200";
  if (t === "LIFT") return "bg-purple-200";
  if (t === "REST" || t === "OFF") return "bg-gray-100";
  return "bg-yellow-100";
};

export const PrintableWeeklyPlan = ({ weeks, title }: PrintableWeeklyPlanProps) => {
  const handlePrint = () => {
    window.print();
  };

  if (!weeks || weeks.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print Plan
        </Button>
      </div>
      
      <div className="print:block" id="printable-plan">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #printable-plan, #printable-plan * { visibility: visible; }
            #printable-plan { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
          }
        `}</style>
        
        <div className="text-center mb-4 print:mb-2">
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="mb-6 print:mb-4 print:break-inside-avoid">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-foreground">
                    <th className="p-1 text-left w-20"></th>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <th key={d} className="p-1 text-center font-bold min-w-[100px]">
                        {getDayLabel(d)}
                      </th>
                    ))}
                    <th className={`p-1 text-center font-bold w-16 ${getPhaseColor(week.phase)}`}>
                      {week.phase}
                    </th>
                  </tr>
                  <tr className="border-b">
                    <th className="p-1 text-left text-xs text-muted-foreground">
                      Week {week.week}
                    </th>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const day = week.days.find(dd => dd.day === d);
                      return (
                        <th key={d} className={`p-1 text-center text-xs ${day?.type ? getTypeColor(day.type) : ""}`}>
                          {week.startDate || ""}
                        </th>
                      );
                    })}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-dashed">
                    <td className="p-1 text-xs font-medium">Type</td>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const day = week.days.find(dd => dd.day === d);
                      return (
                        <td key={d} className={`p-1 text-center text-xs ${day?.type ? getTypeColor(day.type) : ""}`}>
                          {day?.type || day?.ergWorkout?.zone || ""}
                        </td>
                      );
                    })}
                    <td></td>
                  </tr>
                  <tr className="border-b border-dashed">
                    <td className="p-1 text-xs font-medium">Warmup</td>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const day = week.days.find(dd => dd.day === d);
                      return (
                        <td key={d} className="p-1 text-center text-xs">
                          {day?.warmup || ""}
                        </td>
                      );
                    })}
                    <td></td>
                  </tr>
                  <tr className="border-b border-dashed">
                    <td className="p-1 text-xs font-medium">Workout</td>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const day = week.days.find(dd => dd.day === d);
                      return (
                        <td key={d} className="p-1 text-center text-xs">
                          {day?.workout || day?.ergWorkout?.description || ""}
                        </td>
                      );
                    })}
                    <td></td>
                  </tr>
                  <tr className="border-b border-dashed">
                    <td className="p-1 text-xs font-medium">Rest</td>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const day = week.days.find(dd => dd.day === d);
                      return (
                        <td key={d} className="p-1 text-center text-xs">
                          {day?.rest || ""}
                        </td>
                      );
                    })}
                    <td></td>
                  </tr>
                  <tr className="border-b border-dashed">
                    <td className="p-1 text-xs font-medium">Breakup</td>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const day = week.days.find(dd => dd.day === d);
                      return (
                        <td key={d} className="p-1 text-center text-xs">
                          {day?.breakup || ""}
                        </td>
                      );
                    })}
                    <td></td>
                  </tr>
                  <tr className="border-b border-dashed">
                    <td className="p-1 text-xs font-medium">Rates</td>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const day = week.days.find(dd => dd.day === d);
                      return (
                        <td key={d} className="p-1 text-center text-xs">
                          {day?.rates || day?.ergWorkout?.rate || ""}
                        </td>
                      );
                    })}
                    <td></td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-1 text-xs font-medium">Cooldown</td>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const day = week.days.find(dd => dd.day === d);
                      return (
                        <td key={d} className="p-1 text-center text-xs">
                          {day?.cooldown || ""}
                        </td>
                      );
                    })}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};