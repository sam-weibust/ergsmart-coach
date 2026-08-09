import { useRef, useEffect, useMemo, useCallback } from "react";
import {
  PAD, buildIdealCurve, drawCurve, drawGrid, computeStats,
} from "@/lib/forceCurveDraw";

interface ForceCurveCanvasProps {
  currentCurve: number[];
  prevCurve: number[];
  allCurves: number[][];
  driveTime?: number;   // centiseconds
  recoveryTime?: number; // centiseconds
  strokeCount: number;
}

// ── Sparkline component ───────────────────────────────────────────────────────
function PeakForceSparkline({ allCurves }: { allCurves: number[][] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || allCurves.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const peaks = allCurves.map(c => Math.max(...c, 0));
    const maxP = Math.max(...peaks, 1);
    const minP = Math.min(...peaks, 0);
    const range = maxP - minP || 1;

    const padL = 4, padR = 4, padT = 4, padB = 4;
    const iW = W - padL - padR;
    const iH = H - padT - padB;

    // Gradient fill
    const grad = ctx.createLinearGradient(0, padT, 0, padT + iH);
    grad.addColorStop(0, "rgba(59,130,246,0.3)");
    grad.addColorStop(1, "rgba(59,130,246,0)");

    ctx.beginPath();
    peaks.forEach((p, i) => {
      const x = padL + (i / (peaks.length - 1)) * iW;
      const y = padT + iH - ((p - minP) / range) * iH;
      if (i === 0) ctx.moveTo(x, padT + iH);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(padL + iW, padT + iH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = "#1A1A2E";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    peaks.forEach((p, i) => {
      const x = padL + (i / (peaks.length - 1)) * iW;
      const y = padT + iH - ((p - minP) / range) * iH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [allCurves]);

  if (allCurves.length < 2) return null;

  return (
    <div className="px-4 pb-3">
      <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">
        Peak Force / Stroke — {allCurves.length} strokes
      </p>
      <canvas ref={canvasRef} width={600} height={48} className="w-full h-12 rounded" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ForceCurveCanvas({
  currentCurve, prevCurve, allCurves,
  driveTime, recoveryTime, strokeCount,
}: ForceCurveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const pendingRef = useRef(false);

  const avgCurve = useMemo(() => {
    if (allCurves.length < 2 || !allCurves[0]?.length) return null;
    const len = allCurves[0].length;
    return Array.from({ length: len }, (_, i) =>
      allCurves.reduce((s, c) => s + (c[i] ?? 0), 0) / allCurves.length
    );
  }, [allCurves]);

  const maxN = useMemo(() => {
    const allVals = [
      ...currentCurve,
      ...prevCurve,
      ...(avgCurve ?? []),
    ];
    return Math.max(...allVals, 100) * 1.15;
  }, [currentCurve, prevCurve, avgCurve]);

  const idealCurve = useMemo(() => {
    const len = currentCurve.length || 20;
    const peak = maxN / 1.15;
    return buildIdealCurve(len, peak);
  }, [currentCurve.length, maxN]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    drawGrid(ctx, W, H, Math.round(maxN));

    // Ideal bell (muted gray dashed)
    drawCurve(ctx, W, H, idealCurve, maxN, "#C9C9D4", 1.5, 0.7, true, [4, 4]);

    // Session average (white dashed)
    if (avgCurve) {
      drawCurve(ctx, W, H, avgCurve, maxN, "#8B8B9E", 1.5, 0.6, true, [6, 3]);
    }

    // Previous stroke (blue 30% opacity)
    if (prevCurve.length > 0) {
      const resampled = prevCurve.length !== currentCurve.length
        ? Array.from({ length: currentCurve.length }, (_, i) => {
            const t = i / (currentCurve.length - 1) * (prevCurve.length - 1);
            const lo = Math.floor(t);
            const hi = Math.min(Math.ceil(t), prevCurve.length - 1);
            return prevCurve[lo] + (prevCurve[hi] - prevCurve[lo]) * (t - lo);
          })
        : prevCurve;
      drawCurve(ctx, W, H, resampled, maxN, "#1A1A2E", 2, 0.3);
    }

    // Current stroke (bright blue solid)
    drawCurve(ctx, W, H, currentCurve, maxN, "#1A1A2E", 2.5, 1);

    // Legend
    const legendItems = [
      { color: "#1A1A2E", alpha: 1, dash: false, label: "Current" },
      { color: "#1A1A2E", alpha: 0.3, dash: false, label: "Previous" },
      { color: "#8B8B9E", alpha: 0.6, dash: true, label: "Avg" },
      { color: "#C9C9D4", alpha: 0.7, dash: true, label: "Ideal" },
    ];
    ctx.font = "9px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "left";
    let lx = PAD.left + 4;
    for (const item of legendItems) {
      ctx.save();
      ctx.globalAlpha = item.alpha;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.5;
      if (item.dash) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(lx, PAD.top + 8);
      ctx.lineTo(lx + 16, PAD.top + 8);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#6B6B7D";
      ctx.fillText(item.label, lx + 20, PAD.top + 12);
      lx += 60;
    }

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    pendingRef.current = false;
  }, [currentCurve, prevCurve, avgCurve, idealCurve, maxN]);

  // Schedule redraw with rAF
  useEffect(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); pendingRef.current = false; };
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      requestAnimationFrame(draw);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  const stats = useMemo(() => computeStats(currentCurve, driveTime, recoveryTime), [currentCurve, driveTime, recoveryTime]);

  return (
    <div className="rounded-lg border border-border overflow-hidden" style={{ background: "#FFFFFF" }}>
      {/* Header */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-widest">Force Curve</span>
        <span className="text-xs text-muted-foreground font-mono">{strokeCount} stroke{strokeCount !== 1 ? "s" : ""}</span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 300, display: "block" }}
      />

      {/* Metrics row */}
      {stats && (
        <div className="grid grid-cols-5 gap-px" style={{ background: "#E2E1E9" }}>
          <div className="px-3 py-2.5 text-center" style={{ background: "#FFFFFF" }}>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Peak Force</p>
            <p className="text-sm font-bold text-foreground font-mono">{stats.peakForce}N</p>
          </div>
          <div className="px-3 py-2.5 text-center" style={{ background: "#FFFFFF" }}>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Time to Peak</p>
            <p className="text-sm font-bold text-foreground font-mono">
              {stats.timeToPeak != null ? `${stats.timeToPeak}ms` : "--"}
            </p>
          </div>
          <div className="px-3 py-2.5 text-center" style={{ background: "#FFFFFF" }}>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Drive Efficiency</p>
            <p className="text-sm font-bold text-foreground font-mono">{stats.driveEfficiency}%</p>
          </div>
          <div className="px-3 py-2.5 text-center" style={{ background: "#FFFFFF" }}>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Smoothness</p>
            <p className={`text-sm font-bold font-mono ${stats.smoothness >= 7 ? "text-[hsl(var(--success))]" : stats.smoothness >= 5 ? "text-[hsl(var(--warning))]" : "text-destructive"}`}>
              {stats.smoothness}/10
            </p>
          </div>
          <div className="px-3 py-2.5 text-center" style={{ background: "#FFFFFF" }}>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Catch Slip</p>
            {stats.catchSlip ? (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/30">
                SLIP
              </span>
            ) : (
              <p className="text-sm font-bold text-[hsl(var(--success))] font-mono">OK</p>
            )}
          </div>
        </div>
      )}

      {/* Sparkline */}
      {allCurves.length >= 2 && <PeakForceSparkline allCurves={allCurves} />}
    </div>
  );
}
