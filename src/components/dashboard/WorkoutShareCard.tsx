import { useRef, useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import logoSrc from "@/assets/crewsync-logo-icon.jpg";

interface WorkoutStats {
  athleteName: string;
  workoutType: string;
  date: string;
  // Primary stats
  distance?: string;
  time?: string;
  avgSplit?: string;
  watts?: string | number;
  strokeRate?: string | number;
  // Secondary stats
  avgHR?: string | number;
  maxHR?: string | number;
  minHR?: string | number;
  calories?: string | number;
  calHour?: string | number;
  dragFactor?: string | number;
  workPerStroke?: string | number;
  notes?: string;
  improvement?: string;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawCard(canvas: HTMLCanvasElement, stats: WorkoutStats, onDone: () => void) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = 1080;
  const H = 1080;
  canvas.width = W;
  canvas.height = H;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a1628");
  bg.addColorStop(0.5, "#112240");
  bg.addColorStop(1, "#0a1628");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Glow top-right
  const glow1 = ctx.createRadialGradient(W * 0.85, H * 0.12, 0, W * 0.85, H * 0.12, 420);
  glow1.addColorStop(0, "rgba(45,107,228,0.22)");
  glow1.addColorStop(1, "transparent");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  // Glow bottom-left
  const glow2 = ctx.createRadialGradient(W * 0.12, H * 0.88, 0, W * 0.12, H * 0.88, 350);
  glow2.addColorStop(0, "rgba(45,107,228,0.14)");
  glow2.addColorStop(1, "transparent");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Card border
  ctx.save();
  drawRoundedRect(ctx, 48, 48, W - 96, H - 96, 32);
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Top accent line
  const accent = ctx.createLinearGradient(48, 48, W - 48, 48);
  accent.addColorStop(0, "#2d6be4");
  accent.addColorStop(1, "#1e55c4");
  ctx.save();
  drawRoundedRect(ctx, 48, 48, W - 96, 5, 2.5);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  const img = new Image();
  img.onload = () => {
    // Logo
    ctx.save();
    ctx.beginPath();
    ctx.arc(120, 170, 38, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 82, 132, 76, 76);
    ctx.restore();

    // Brand
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("CrewSync", 178, 185);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "26px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("Rowing Performance", 180, 216);

    // Divider
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(80, 246, W - 160, 1);

    // Athlete name
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${stats.athleteName.length > 18 ? 58 : 68}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.fillText(stats.athleteName, 80, 330);

    // Workout type badge
    ctx.save();
    const typeText = stats.workoutType.toUpperCase();
    ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const typeW = ctx.measureText(typeText).width + 36;
    drawRoundedRect(ctx, 80, 348, typeW, 42, 21);
    ctx.fillStyle = "#2d6be4";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(typeText, 98, 375);
    ctx.restore();

    // Date (right-aligned)
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const dateW = ctx.measureText(stats.date).width;
    ctx.fillText(stats.date, W - 80 - dateW, 375);

    // Divider
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(80, 406, W - 160, 1);

    // Build stat items — primary and secondary
    const primary: { label: string; value: string }[] = [];
    const secondary: { label: string; value: string }[] = [];

    if (stats.distance) primary.push({ label: "Distance", value: stats.distance });
    if (stats.time) primary.push({ label: "Time", value: stats.time });
    if (stats.avgSplit) primary.push({ label: "Avg Split /500m", value: stats.avgSplit });
    if (stats.watts) primary.push({ label: "Watts", value: String(stats.watts) + "W" });
    if (stats.strokeRate) secondary.push({ label: "Stroke Rate", value: String(stats.strokeRate) + " spm" });
    if (stats.avgHR) secondary.push({ label: "Avg HR", value: String(stats.avgHR) + " bpm" });
    if (stats.maxHR) secondary.push({ label: "Max HR", value: String(stats.maxHR) + " bpm" });
    if (stats.calories) secondary.push({ label: "Calories", value: String(stats.calories) + " cal" });
    if (stats.calHour) secondary.push({ label: "Cal/Hour", value: String(stats.calHour) });
    if (stats.dragFactor) secondary.push({ label: "Drag Factor", value: String(stats.dragFactor) });
    if (stats.workPerStroke) secondary.push({ label: "Work/Stroke", value: String(stats.workPerStroke) + "J" });

    const MARGIN = 80;
    const GAP = 16;
    const CONTENT_W = W - MARGIN * 2;

    // PRIMARY stats — larger cards, 2 or 4 across
    const primCols = primary.length <= 2 ? primary.length : 4;
    const primCardW = (CONTENT_W - GAP * (primCols - 1)) / primCols;
    const primCardH = 148;
    const primStartY = 428;

    primary.forEach((item, i) => {
      const col = i % primCols;
      const row = Math.floor(i / primCols);
      const x = MARGIN + col * (primCardW + GAP);
      const y = primStartY + row * (primCardH + GAP);

      ctx.save();
      drawRoundedRect(ctx, x, y, primCardW, primCardH, 14);
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(item.label.toUpperCase(), x + 16, y + 34);

      ctx.fillStyle = "#ffffff";
      const valFontSize = item.value.length > 7 ? 36 : 44;
      ctx.font = `bold ${valFontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.fillText(item.value, x + 16, y + 102);
    });

    const primRows = Math.ceil(primary.length / primCols);
    const secStartY = primStartY + primRows * (primCardH + GAP) + 8;

    // SECONDARY stats — smaller cards, up to 4 across
    if (secondary.length > 0) {
      const secCols = Math.min(4, secondary.length);
      const secCardW = (CONTENT_W - GAP * (secCols - 1)) / secCols;
      const secCardH = 110;

      // Section label
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("ADDITIONAL METRICS", MARGIN, secStartY - 6);

      secondary.forEach((item, i) => {
        const col = i % secCols;
        const row = Math.floor(i / secCols);
        const x = MARGIN + col * (secCardW + GAP);
        const y = secStartY + row * (secCardH + GAP) + 10;

        ctx.save();
        drawRoundedRect(ctx, x, y, secCardW, secCardH, 12);
        ctx.fillStyle = "rgba(45,107,228,0.12)";
        ctx.fill();
        ctx.strokeStyle = "rgba(45,107,228,0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "15px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillText(item.label.toUpperCase(), x + 14, y + 28);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillText(item.value, x + 14, y + 78);
      });

      const secRows = Math.ceil(secondary.length / secCols);
      const afterSec = secStartY + secRows * (secCardH + GAP) + 24;

      // Notes (if short enough)
      if (stats.notes && stats.notes.length < 80 && afterSec < H - 120) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "italic 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillText(`"${stats.notes}"`, MARGIN, afterSec);
      }
    } else if (stats.notes && stats.notes.length < 80) {
      // No secondary — show notes
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "italic 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(`"${stats.notes}"`, MARGIN, secStartY + 16);
    }

    // Improvement badge (above watermark)
    if (stats.improvement) {
      ctx.save();
      drawRoundedRect(ctx, MARGIN, H - 110, 480, 54, 27);
      ctx.fillStyle = "rgba(16,185,129,0.2)";
      ctx.fill();
      ctx.fillStyle = "#10b981";
      ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("▲ " + stats.improvement + " vs previous best", MARGIN + 20, H - 76);
      ctx.restore();
    }

    // Watermark
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const wm = "crewsync.app";
    ctx.fillText(wm, W - MARGIN - ctx.measureText(wm).width, H - 62);

    onDone();
  };

  img.onerror = () => {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px sans-serif";
    ctx.fillText("CrewSync", 80, 185);
    onDone();
  };
  img.src = logoSrc;
}

// ─── Dialog component ────────────────────────────────────────────────────────

interface WorkoutShareCardProps {
  open: boolean;
  onClose: () => void;
  stats: WorkoutStats;
}

export function WorkoutShareCard({ open, onClose, stats }: WorkoutShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [rendered, setRendered] = useState(false);

  const render = useCallback(() => {
    if (canvasRef.current) drawCard(canvasRef.current, stats, () => setRendered(true));
  }, [stats]);

  useEffect(() => {
    if (open) { setRendered(false); setTimeout(render, 60); }
  }, [open, render]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `crewsync-workout-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Workout card downloaded!");
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/athlete/${encodeURIComponent(stats.athleteName.toLowerCase().replace(/\s+/g, ""))}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-[#0a1628] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Share2 className="h-5 w-5 text-[#2d6be4]" />
            Share Workout
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-white/10">
            <canvas ref={canvasRef} className="w-full h-full object-contain" style={{ background: "#0a1628" }} />
            {!rendered && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0a1628]">
                <div className="w-8 h-8 border-2 border-[#2d6be4] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={handleDownload} disabled={!rendered} className="flex-1 bg-[#2d6be4] hover:bg-[#1e55c4] text-white gap-2">
              <Download className="h-4 w-4" />Download Image
            </Button>
            <Button onClick={handleCopyLink} variant="outline" className="flex-1 border-white/20 text-white hover:bg-white/10 gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
          <p className="text-xs text-white/40 text-center">1080×1080px — optimized for Instagram & Twitter</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Button that wires up workout data ───────────────────────────────────────

interface ShareWorkoutButtonProps {
  workout: any;
  athleteName: string;
  workoutType?: string;
  previousBest?: number | null;
}

// Parse PostgreSQL interval "HH:MM:SS" or "MM:SS" → total seconds
function parseInterval(v: string | null | undefined): number | null {
  if (!v) return null;
  const parts = v.split(":");
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  return null;
}

// Format deciseconds → "H:MM:SS" or "M:SS"
function fmtDeciSec(ds: number | null | undefined): string | undefined {
  if (!ds) return undefined;
  const s = ds / 10;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Format total seconds → "H:MM:SS" or "M:SS"
function fmtSec(s: number | null | undefined): string | undefined {
  if (!s) return undefined;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Format split seconds per 500m → "M:SS"
function fmtSplitSec(s: number | null | undefined): string | undefined {
  if (!s || s <= 0) return undefined;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Parse text split "M:SS" or "M:SS.t" → seconds per 500m
function parseSplitText(v: string | null | undefined): number | null {
  if (!v) return null;
  const str = String(v).trim();
  const parts = str.split(":");
  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
  }
  return null;
}

// Resolve split to seconds per 500m from any representation:
// - split_for_pace (deciseconds from C2)
// - avg_split (text "M:SS.t" from manual entry)
// - fallback: calculate from distance + total time
function resolveSplitSec(workout: any, totalTimeSec: number | null): number | null {
  if (workout.split_for_pace != null && Number(workout.split_for_pace) > 0) {
    return Number(workout.split_for_pace) / 10;
  }
  if (workout.avg_split) {
    const parsed = parseSplitText(workout.avg_split);
    if (parsed && parsed > 0) return parsed;
  }
  // Calculate from distance + total time (works for multi-piece summary too)
  if (workout.distance && totalTimeSec && totalTimeSec > 0 && workout.distance > 0) {
    return (totalTimeSec / workout.distance) * 500;
  }
  return null;
}

// Watts from split seconds per 500m
function wattFromSplitSec(s: number | null | undefined): number | undefined {
  if (!s || s <= 0) return undefined;
  return Math.round(2.80 / Math.pow(s / 500, 3));
}

// Format deciseconds split → "M:SS" (kept for legacy callers)
function fmtSplitDeciSec(ds: number | null | undefined): string | undefined {
  if (!ds) return undefined;
  return fmtSplitSec(ds / 10);
}

// Watts from split deciseconds (kept for legacy callers)
function wattFromDeciSec(ds: number | null | undefined): number | undefined {
  if (!ds) return undefined;
  return wattFromSplitSec(ds / 10);
}

export function ShareWorkoutButton({ workout, athleteName, workoutType = "Erg", previousBest }: ShareWorkoutButtonProps) {
  const [open, setOpen] = useState(false);

  // Time: prefer total_time_seconds (deciseconds from C2), else parse interval duration
  const totalTimeSec = workout.total_time_seconds
    ? workout.total_time_seconds / 10
    : parseInterval(workout.duration);

  // Resolve split seconds per 500m — handles C2 deciseconds, text format, and calculated
  const splitSec = resolveSplitSec(workout, totalTimeSec);

  const improvement = (() => {
    if (!previousBest || !totalTimeSec) return undefined;
    const diff = previousBest - totalTimeSec;
    if (diff <= 0) return undefined;
    const m = Math.floor(diff / 60);
    const s = Math.round(diff % 60);
    return m > 0 ? `${m}m ${s}s faster` : `${s}s faster`;
  })();

  // Strip SR/DF annotations from notes if embedded
  const rawNotes = workout.notes || "";
  const cleanNotes = rawNotes.replace(/SR:\s*\d+\s*spm\s*\|?\s*/gi, "").replace(/DF:\s*\d+\s*\|?\s*/gi, "").trim();

  // Parse SR / DF from notes if not in dedicated columns
  const srMatch = rawNotes.match(/SR:\s*(\d+)/i);
  const dfMatch = rawNotes.match(/DF:\s*(\d+)/i);
  const strokeRate = workout.stroke_rate ?? (srMatch ? parseInt(srMatch[1]) : undefined);
  const dragFactor = workout.drag_factor ?? (dfMatch ? parseInt(dfMatch[1]) : undefined);

  const fmtDist = (m: number | null | undefined) => {
    if (!m) return undefined;
    return m >= 1000 ? `${(m / 1000).toFixed(1)}k m` : `${m} m`;
  };

  const stats: WorkoutStats = {
    athleteName,
    workoutType,
    date: workout.workout_date
      ? new Date(workout.workout_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    // Primary — avg split per 500m shown prominently
    distance: fmtDist(workout.distance),
    time: workout.total_time_seconds ? fmtDeciSec(workout.total_time_seconds) : fmtSec(totalTimeSec ?? undefined),
    avgSplit: fmtSplitSec(splitSec),
    watts: wattFromSplitSec(splitSec),
    strokeRate: strokeRate || undefined,
    // Secondary
    avgHR: workout.avg_heart_rate || undefined,
    maxHR: workout.max_heart_rate || undefined,
    minHR: workout.min_heart_rate || undefined,
    calories: workout.calories || undefined,
    calHour: workout.cal_hour || undefined,
    dragFactor: dragFactor || undefined,
    workPerStroke: workout.work_per_stroke || undefined,
    notes: cleanNotes || undefined,
    improvement,
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5 border-[#2d6be4]/40 text-[#2d6be4] hover:bg-[#2d6be4]/10"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </Button>
      <WorkoutShareCard open={open} onClose={() => setOpen(false)} stats={stats} />
    </>
  );
}
