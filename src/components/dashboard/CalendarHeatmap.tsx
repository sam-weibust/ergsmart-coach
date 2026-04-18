import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

interface CalendarHeatmapProps {
  userId: string;
}

const DAYS = 91; // ~13 weeks

export function CalendarHeatmap({ userId }: CalendarHeatmapProps) {
  const { data: workouts = [] } = useQuery({
    queryKey: ["heatmap-workouts", userId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - DAYS);
      const { data } = await supabase
        .from("erg_workouts")
        .select("workout_date, distance, workout_type")
        .eq("user_id", userId)
        .gte("workout_date", since.toISOString().split("T")[0])
        .order("workout_date");
      return data || [];
    },
    enabled: !!userId,
  });

  const dayMap = useMemo(() => {
    const map: Record<string, { distance: number; type: string }> = {};
    for (const w of workouts as any[]) {
      const key = w.workout_date;
      if (!map[key]) map[key] = { distance: 0, type: w.workout_type || "" };
      map[key].distance += w.distance || 0;
    }
    return map;
  }, [workouts]);

  const cells = useMemo(() => {
    const arr = [];
    const today = new Date();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const info = dayMap[key];
      arr.push({ key, info, dow: d.getDay() });
    }
    return arr;
  }, [dayMap]);

  const getColor = (info?: { distance: number; type: string }) => {
    if (!info || info.distance === 0) return "bg-white/5";
    const dist = info.distance;
    const type = info.type?.toLowerCase() || "";
    if (type.includes("easy") || type.includes("light")) return "bg-blue-400/40";
    if (dist >= 10000) return "bg-[#2d6be4]";
    if (dist >= 6000) return "bg-[#2d6be4]/70";
    if (dist >= 3000) return "bg-[#2d6be4]/45";
    return "bg-[#2d6be4]/25";
  };

  const weeks: typeof cells[] = [];
  let week: typeof cells = [];
  for (const cell of cells) {
    if (cell.dow === 0 && week.length > 0) {
      weeks.push(week);
      week = [];
    }
    week.push(cell);
  }
  if (week.length > 0) weeks.push(week);

  const monthLabels = useMemo(() => {
    const labels: { label: string; weekIndex: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((wk, wi) => {
      const d = new Date(wk[0].key);
      if (d.getMonth() !== lastMonth) {
        labels.push({
          label: d.toLocaleDateString("en-US", { month: "short" }),
          weekIndex: wi,
        });
        lastMonth = d.getMonth();
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Training Consistency (90 days)</p>
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          <span>Less</span>
          {["bg-white/5", "bg-[#2d6be4]/25", "bg-[#2d6be4]/45", "bg-[#2d6be4]/70", "bg-[#2d6be4]"].map(c => (
            <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Month labels */}
      <div className="relative overflow-x-auto">
        <div className="flex gap-px mb-1">
          {weeks.map((_, wi) => {
            const label = monthLabels.find(m => m.weekIndex === wi);
            return (
              <div key={wi} className="flex flex-col gap-px" style={{ minWidth: 12 }}>
                <span className="text-[9px] text-white/40 whitespace-nowrap">
                  {label?.label || ""}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-px">
          {weeks.map((wk, wi) => (
            <div key={wi} className="flex flex-col gap-px">
              {Array.from({ length: 7 }).map((_, dow) => {
                const cell = wk.find(c => c.dow === dow);
                if (!cell) {
                  return <div key={dow} className="w-3 h-3 rounded-sm bg-transparent" />;
                }
                return (
                  <div
                    key={dow}
                    title={cell.info ? `${cell.key}: ${(cell.info.distance / 1000).toFixed(1)}k m` : cell.key}
                    className={`w-3 h-3 rounded-sm transition-all hover:ring-1 hover:ring-white/30 ${getColor(cell.info)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Day labels */}
      <div className="flex gap-px mt-1">
        <div className="flex flex-col gap-px mr-1" style={{ minWidth: 16 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="text-[9px] text-white/30 h-3 flex items-center">{i % 2 === 1 ? d : ""}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
