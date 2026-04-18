import { useRef, useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";
import logoSrc from "@/assets/crewsync-logo-icon.jpg";

interface WorkoutStats {
  athleteName: string;
  workoutType: string;
  date: string;
  distance?: string;
  time?: string;
  avgSplit?: string;
  watts?: string | number;
  strokeRate?: string | number;
  improvement?: string;
}

interface WorkoutShareCardProps {
  open: boolean;
  onClose: () => void;
  stats: WorkoutStats;
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

export function WorkoutShareCard({ open, onClose, stats }: WorkoutShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [rendered, setRendered] = useState(false);

  const drawCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;

    // Background gradient — deep navy
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0a1628");
    bg.addColorStop(0.5, "#112240");
    bg.addColorStop(1, "#0a1628");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle blue glow top-right
    const glowGrad = ctx.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, 400);
    glowGrad.addColorStop(0, "rgba(45,107,228,0.18)");
    glowGrad.addColorStop(1, "transparent");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, W, H);

    // Bottom-left glow
    const glow2 = ctx.createRadialGradient(W * 0.15, H * 0.85, 0, W * 0.15, H * 0.85, 350);
    glow2.addColorStop(0, "rgba(45,107,228,0.12)");
    glow2.addColorStop(1, "transparent");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    // White card body
    ctx.save();
    drawRoundedRect(ctx, 60, 120, W - 120, H - 180, 32);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Top accent bar
    const accentGrad = ctx.createLinearGradient(60, 120, 60 + W - 120, 120);
    accentGrad.addColorStop(0, "#2d6be4");
    accentGrad.addColorStop(1, "#1e55c4");
    ctx.save();
    drawRoundedRect(ctx, 60, 120, W - 120, 6, 3);
    ctx.fillStyle = accentGrad;
    ctx.fill();
    ctx.restore();

    // Logo & CrewSync brand — load image
    const img = new Image();
    img.onload = () => {
      // Logo circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(140, 220, 45, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 95, 175, 90, 90);
      ctx.restore();

      // Brand name next to logo
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("CrewSync", 210, 236);

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "28px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("Rowing Performance", 212, 272);

      // Athlete name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 72px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(stats.athleteName, 80, 390);

      // Workout type badge
      ctx.save();
      const typeText = stats.workoutType.toUpperCase();
      const typeW = ctx.measureText(typeText).width + 40;
      drawRoundedRect(ctx, 80, 410, typeW, 48, 24);
      ctx.fillStyle = "#2d6be4";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(typeText, 100, 443);
      ctx.restore();

      // Date
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "26px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(stats.date, 80, 510);

      // Stats grid
      const statItems = [
        { label: "Distance", value: stats.distance || "—" },
        { label: "Time", value: stats.time || "—" },
        { label: "Avg Split /500m", value: stats.avgSplit || "—" },
        { label: "Watts", value: stats.watts ? String(stats.watts) + "W" : "—" },
        { label: "Stroke Rate", value: stats.strokeRate ? String(stats.strokeRate) + " spm" : "—" },
      ].filter(s => s.value !== "—");

      const cols = Math.min(3, statItems.length);
      const cardW = (W - 120 - 60) / cols - 20;
      const cardH = 160;
      const startX = 80;
      const startY = 560;

      statItems.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (cardW + 20);
        const y = startY + row * (cardH + 20);

        ctx.save();
        drawRoundedRect(ctx, x, y, cardW, cardH, 16);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "20px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillText(item.label.toUpperCase(), x + 20, y + 38);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillText(item.value, x + 20, y + 110);
      });

      // Improvement badge
      if (stats.improvement) {
        const impRow = Math.ceil(statItems.length / cols);
        const impY = startY + impRow * (cardH + 20) + 10;

        ctx.save();
        ctx.fillStyle = "rgba(16,185,129,0.2)";
        drawRoundedRect(ctx, 80, impY, 400, 64, 32);
        ctx.fill();
        ctx.fillStyle = "#10b981";
        ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillText("▲ " + stats.improvement + " vs previous best", 110, impY + 41);
        ctx.restore();
      }

      // Bottom: crewsync.app watermark
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "24px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("crewsync.app", W - 60 - ctx.measureText("crewsync.app").width, H - 40);

      setRendered(true);
    };
    img.onerror = () => {
      // Draw without logo
      ctx.fillStyle = "#2d6be4";
      ctx.font = "bold 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("CrewSync", 80, 240);
      setRendered(true);
    };
    img.src = logoSrc;
  }, [stats]);

  useEffect(() => {
    if (open) {
      setRendered(false);
      setTimeout(drawCard, 50);
    }
  }, [open, drawCard]);

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
            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain"
              style={{ background: "#0a1628" }}
            />
            {!rendered && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0a1628]">
                <div className="w-8 h-8 border-2 border-[#2d6be4] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleDownload}
              disabled={!rendered}
              className="flex-1 bg-[#2d6be4] hover:bg-[#1e55c4] text-white gap-2"
            >
              <Download className="h-4 w-4" />
              Download Image
            </Button>
            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10 gap-2"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>

          <p className="text-xs text-white/40 text-center">
            1080×1080px — optimized for Instagram & Twitter
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ShareWorkoutButtonProps {
  workout: any;
  athleteName: string;
  workoutType?: string;
  previousBest?: number | null;
}

export function ShareWorkoutButton({ workout, athleteName, workoutType = "Erg", previousBest }: ShareWorkoutButtonProps) {
  const [open, setOpen] = useState(false);

  const fmtTime = (ds: number | null | undefined) => {
    if (!ds) return undefined;
    const s = ds / 10;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const fmtSplit = (ds: number | null | undefined) => {
    if (!ds) return undefined;
    const s = ds / 10;
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const fmtDist = (m: number | null | undefined) => {
    if (!m) return undefined;
    return m >= 1000 ? `${(m / 1000).toFixed(1)}k m` : `${m} m`;
  };

  const wattFromSplit = (ds: number | null | undefined) => {
    if (!ds) return undefined;
    const s = ds / 10;
    return Math.round(2.80 / Math.pow(s / 500, 3));
  };

  const improvement = (() => {
    if (!previousBest || !workout.total_time_seconds) return undefined;
    const diff = previousBest - workout.total_time_seconds / 10;
    if (diff <= 0) return undefined;
    const m = Math.floor(diff / 60);
    const s = Math.round(diff % 60);
    return m > 0 ? `${m}m ${s}s faster` : `${s}s faster`;
  })();

  const stats: WorkoutStats = {
    athleteName,
    workoutType,
    date: workout.workout_date
      ? new Date(workout.workout_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    distance: fmtDist(workout.distance),
    time: fmtTime(workout.total_time_seconds),
    avgSplit: fmtSplit(workout.split_for_pace ?? workout.avg_split),
    watts: wattFromSplit(workout.split_for_pace ?? workout.avg_split),
    strokeRate: workout.stroke_rate,
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
