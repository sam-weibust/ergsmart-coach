import { useRef, useEffect, useMemo, useCallback } from "react";

interface ForceCurveCanvasProps {
  currentCurve: number[];
  prevCurve: number[];
  allCurves: number[][];
  driveTime?: number;   // centiseconds
  recoveryTime?: number; // centiseconds
  strokeCount: number;
}

// ── Ideal bell curve generator ────────────────────────────────────────────────
function buildIdealCurve(len: number, peakVal: number): number[] {
  const peakIdx = Math.round(len * 0.33);
  const sigma = len * 0.22;
  return Array.from({ length: len }, (_, i) =>
    peakVal * Math.exp(-0.5 * Math.pow((i - peakIdx) / sigma, 2))
  );
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
const PAD = { top: 28, right: 24, bottom: 48, left: 56 };

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number, maxN: number) {
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  ctx.strokeStyle = "#1e2d45";
  ctx.lineWidth = 1;

  // Horizontal grid lines (every 25% of maxN)
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const y = PAD.top + (iH * i) / yTicks;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + iW, y);
    ctx.stroke();

    // Y labels
    const label = Math.round(maxN * (1 - i / yTicks));
    ctx.fillStyle = "#4b6080";
    ctx.font = "10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${label}N`, PAD.left - 6, y + 3.5);
  }

  // Vertical grid lines at 0 25 50 75 100%
  const xTicks = [0, 25, 50, 75, 100];
  for (const pct of xTicks) {
    const x = PAD.left + (iW * pct) / 100;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, PAD.top + iH);
    ctx.stroke();

    // X labels
    ctx.fillStyle = "#4b6080";
    ctx.font = "10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${pct}%`, x, PAD.top + iH + 16);
  }

  // Axis labels
  ctx.fillStyle = "#6b7a99";
  ctx.font = "10px 'Inter', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Drive Phase", PAD.left + iW / 2, H - 4);

  ctx.save();
  ctx.translate(12, PAD.top + iH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Force (N)", 0, 0);
  ctx.restore();
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  data: number[], maxN: number,
  color: string, lineWidth: number,
  alpha: number = 1,
  dashed: boolean = false,
  dashPattern: number[] = []
) {
  if (data.length < 2) return;
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (dashed && dashPattern.length) ctx.setLineDash(dashPattern);
  else ctx.setLineDash([]);

  ctx.beginPath();
  data.forEach((v, i) => {
    const x = PAD.left + (i / (data.length - 1)) * iW;
    const y = PAD.top + iH - (Math.max(0, v) / maxN) * iH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

// ── Stats computation ─────────────────────────────────────────────────────────
function computeStats(curve: number[], driveTime?: number, recoveryTime?: number) {
  if (!curve.length) return null;
  const len = curve.length;
  const peakForce = Math.max(...curve, 0);
  const peakIdx = curve.indexOf(peakForce);
  const driveMs = driveTime ? driveTime * 10 : null;
  const timeToPeak = driveMs ? Math.round((peakIdx / len) * driveMs) : null;

  // Drive efficiency: % of drive with force > 5% of peak
  const threshold = peakForce * 0.05;
  const positiveCount = curve.filter(v => v > threshold).length;
  const driveEfficiency = Math.round((positiveCount / len) * 100);

  // Smoothness: penalise high second derivatives
  const d2 = curve.slice(1, -1).map((v, i) =>
    Math.abs((curve[i + 2] ?? v) - 2 * v + curve[i])
  );
  const smoothness = d2.length > 0
    ? Math.max(1, Math.min(10, Math.round(10 - (d2.reduce((a, b) => a + b, 0) / d2.length / Math.max(peakForce, 1)) * 30)))
    : 5;

  // Catch slip: first 15% of drive should rise quickly
  const catchWindow = Math.max(1, Math.floor(len * 0.15));
  const catchAvg = curve.slice(0, catchWindow).reduce((a, b) => a + b, 0) / catchWindow;
  const catchSlip = peakForce > 0 && catchAvg < peakForce * 0.12;

  return { peakForce: Math.round(peakForce), timeToPeak, driveEfficiency, smoothness, catchSlip };
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
    ctx.strokeStyle = "#3b82f6";
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
      <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">
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
    ctx.fillStyle = "#050d18";
    ctx.fillRect(0, 0, W, H);

    drawGrid(ctx, W, H, Math.round(maxN));

    // Ideal bell (muted gray dashed)
    drawCurve(ctx, W, H, idealCurve, maxN, "#334155", 1.5, 0.7, true, [4, 4]);

    // Session average (white dashed)
    if (avgCurve) {
      drawCurve(ctx, W, H, avgCurve, maxN, "#e2e8f0", 1.5, 0.6, true, [6, 3]);
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
      drawCurve(ctx, W, H, resampled, maxN, "#3b82f6", 2, 0.3);
    }

    // Current stroke (bright blue solid)
    drawCurve(ctx, W, H, currentCurve, maxN, "#60a5fa", 2.5, 1);

    // Legend
    const legendItems = [
      { color: "#60a5fa", alpha: 1, dash: false, label: "Current" },
      { color: "#3b82f6", alpha: 0.3, dash: false, label: "Previous" },
      { color: "#e2e8f0", alpha: 0.6, dash: true, label: "Avg" },
      { color: "#334155", alpha: 0.7, dash: true, label: "Ideal" },
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
      ctx.fillStyle = "#6b7a99";
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
    <div className="rounded-xl border border-gray-800 overflow-hidden" style={{ background: "#050d18" }}>
      {/* Header */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Force Curve</span>
        <span className="text-xs text-gray-600 font-mono">{strokeCount} stroke{strokeCount !== 1 ? "s" : ""}</span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 300, display: "block" }}
      />

      {/* Metrics row */}
      {stats && (
        <div className="grid grid-cols-5 gap-px" style={{ background: "#0f1929" }}>
          <div className="px-3 py-2.5 text-center" style={{ background: "#050d18" }}>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Peak Force</p>
            <p className="text-sm font-bold text-white font-mono">{stats.peakForce}N</p>
          </div>
          <div className="px-3 py-2.5 text-center" style={{ background: "#050d18" }}>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Time to Peak</p>
            <p className="text-sm font-bold text-white font-mono">
              {stats.timeToPeak != null ? `${stats.timeToPeak}ms` : "--"}
            </p>
          </div>
          <div className="px-3 py-2.5 text-center" style={{ background: "#050d18" }}>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Drive Efficiency</p>
            <p className="text-sm font-bold text-white font-mono">{stats.driveEfficiency}%</p>
          </div>
          <div className="px-3 py-2.5 text-center" style={{ background: "#050d18" }}>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Smoothness</p>
            <p className={`text-sm font-bold font-mono ${stats.smoothness >= 7 ? "text-green-400" : stats.smoothness >= 5 ? "text-yellow-400" : "text-red-400"}`}>
              {stats.smoothness}/10
            </p>
          </div>
          <div className="px-3 py-2.5 text-center" style={{ background: "#050d18" }}>
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Catch Slip</p>
            {stats.catchSlip ? (
              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-900/60 text-red-400 border border-red-700/40">
                SLIP
              </span>
            ) : (
              <p className="text-sm font-bold text-green-400 font-mono">OK</p>
            )}
          </div>
        </div>
      )}

      {/* Sparkline */}
      {allCurves.length >= 2 && <PeakForceSparkline allCurves={allCurves} />}
    </div>
  );
}
