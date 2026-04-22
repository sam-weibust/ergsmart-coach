import { useRef, useEffect, useMemo, useState, useCallback } from "react";

interface ForceCurvePostWorkoutProps {
  forceCurves: number[][];
}

const PAD = { top: 28, right: 24, bottom: 48, left: 56 };

function buildIdealCurve(len: number, peakVal: number): number[] {
  const peakIdx = Math.round(len * 0.33);
  const sigma = len * 0.22;
  return Array.from({ length: len }, (_, i) =>
    peakVal * Math.exp(-0.5 * Math.pow((i - peakIdx) / sigma, 2))
  );
}

function resample(curve: number[], targetLen: number): number[] {
  if (curve.length === targetLen) return curve;
  return Array.from({ length: targetLen }, (_, i) => {
    const t = (i / (targetLen - 1)) * (curve.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(Math.ceil(t), curve.length - 1);
    return curve[lo] + (curve[hi] - curve[lo]) * (t - lo);
  });
}

function drawCurveOnCanvas(
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

function drawGridOnCanvas(ctx: CanvasRenderingContext2D, W: number, H: number, maxN: number) {
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  ctx.strokeStyle = "#1e2d45";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (iH * i) / 4;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + iW, y); ctx.stroke();
    ctx.fillStyle = "#4b6080";
    ctx.font = "10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(maxN * (1 - i / 4))}N`, PAD.left - 6, y + 3.5);
  }
  const xTicks = [0, 25, 50, 75, 100];
  for (const pct of xTicks) {
    const x = PAD.left + (iW * pct) / 100;
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + iH); ctx.stroke();
    ctx.fillStyle = "#4b6080";
    ctx.font = "10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${pct}%`, x, PAD.top + iH + 16);
  }
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

export default function ForceCurvePostWorkout({ forceCurves }: ForceCurvePostWorkoutProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrubIdx, setScrubIdx] = useState(0);

  // Normalize to common length
  const len = useMemo(() => {
    const lens = forceCurves.map(c => c.length).filter(Boolean);
    if (!lens.length) return 20;
    return Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
  }, [forceCurves]);

  const normalized = useMemo(() =>
    forceCurves.map(c => resample(c, len)),
    [forceCurves, len]
  );

  const { avgCurve, bestIdx, worstIdx } = useMemo(() => {
    const peaks = normalized.map(c => Math.max(...c, 0));
    const bestIdx = peaks.indexOf(Math.max(...peaks));
    const worstIdx = peaks.indexOf(Math.min(...peaks));
    const avgCurve = Array.from({ length: len }, (_, i) =>
      normalized.reduce((s, c) => s + (c[i] ?? 0), 0) / normalized.length
    );
    return { avgCurve, bestIdx, worstIdx };
  }, [normalized, len]);

  const maxN = useMemo(() => {
    const allVals = [
      ...avgCurve,
      ...(normalized[bestIdx] ?? []),
      ...(normalized[worstIdx] ?? []),
      ...(normalized[scrubIdx] ?? []),
    ];
    return Math.max(...allVals, 100) * 1.15;
  }, [avgCurve, normalized, bestIdx, worstIdx, scrubIdx]);

  const idealCurve = useMemo(() => buildIdealCurve(len, maxN / 1.15), [len, maxN]);

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
    ctx.fillStyle = "#050d18";
    ctx.fillRect(0, 0, W, H);

    drawGridOnCanvas(ctx, W, H, Math.round(maxN));

    // Ideal (gray dashed)
    drawCurveOnCanvas(ctx, W, H, idealCurve, maxN, "#334155", 1.5, 0.6, true, [4, 4]);

    // Average (white dashed)
    drawCurveOnCanvas(ctx, W, H, avgCurve, maxN, "#e2e8f0", 2, 0.7, true, [6, 3]);

    // Worst stroke (red)
    if (normalized[worstIdx]) {
      drawCurveOnCanvas(ctx, W, H, normalized[worstIdx], maxN, "#ef4444", 2, 0.8);
    }

    // Best stroke (gold)
    if (normalized[bestIdx]) {
      drawCurveOnCanvas(ctx, W, H, normalized[bestIdx], maxN, "#f59e0b", 2, 0.9);
    }

    // Selected stroke (bright blue if not best/worst, else highlight)
    const isBest = scrubIdx === bestIdx;
    const isWorst = scrubIdx === worstIdx;
    if (!isBest && !isWorst && normalized[scrubIdx]) {
      drawCurveOnCanvas(ctx, W, H, normalized[scrubIdx], maxN, "#60a5fa", 2.5, 1);
    } else if (normalized[scrubIdx]) {
      // Draw selection indicator as thicker outline
      const color = isBest ? "#f59e0b" : "#ef4444";
      drawCurveOnCanvas(ctx, W, H, normalized[scrubIdx], maxN, color, 3, 1);
    }

    // Legend
    const legendItems = [
      { color: "#60a5fa", dash: false, label: "Selected" },
      { color: "#f59e0b", dash: false, label: "Best" },
      { color: "#ef4444", dash: false, label: "Worst" },
      { color: "#e2e8f0", dash: true, label: "Avg" },
    ];
    ctx.font = "9px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "left";
    let lx = PAD.left + 4;
    for (const item of legendItems) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      if (item.dash) ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(lx, PAD.top + 8);
      ctx.lineTo(lx + 16, PAD.top + 8);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#6b7a99";
      ctx.fillText(item.label, lx + 20, PAD.top + 12);
      lx += 58;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [normalized, avgCurve, idealCurve, maxN, bestIdx, worstIdx, scrubIdx]);

  useEffect(() => {
    const rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [draw]);

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

  // Peak force sparkline
  const peaks = useMemo(() => normalized.map(c => Math.max(...c, 0)), [normalized]);
  const sparkRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = sparkRef.current;
    if (!canvas || peaks.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const maxP = Math.max(...peaks, 1);
    const minP = Math.min(...peaks, 0);
    const range = maxP - minP || 1;
    const pL = 4, pR = 4, pT = 4, pB = 4;
    const iW = W - pL - pR;
    const iH = H - pT - pB;

    // Background selected highlight
    const sx = pL + (scrubIdx / (peaks.length - 1)) * iW;
    ctx.fillStyle = "rgba(59,130,246,0.15)";
    ctx.fillRect(sx - 2, pT, 4, iH);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, pT, 0, pT + iH);
    grad.addColorStop(0, "rgba(59,130,246,0.25)");
    grad.addColorStop(1, "rgba(59,130,246,0)");
    ctx.beginPath();
    peaks.forEach((p, i) => {
      const x = pL + (i / (peaks.length - 1)) * iW;
      const y = pT + iH - ((p - minP) / range) * iH;
      if (i === 0) { ctx.moveTo(x, pT + iH); ctx.lineTo(x, y); }
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(pL + iW, pT + iH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    peaks.forEach((p, i) => {
      const x = pL + (i / (peaks.length - 1)) * iW;
      const y = pT + iH - ((p - minP) / range) * iH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots for best (gold), worst (red), selected (white)
    peaks.forEach((p, i) => {
      const x = pL + (i / (peaks.length - 1)) * iW;
      const y = pT + iH - ((p - minP) / range) * iH;
      if (i === bestIdx || i === worstIdx || i === scrubIdx) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = i === bestIdx ? "#f59e0b" : i === worstIdx ? "#ef4444" : "#ffffff";
        ctx.fill();
      }
    });
  }, [peaks, scrubIdx, bestIdx, worstIdx]);

  // Stats for selected stroke
  const selectedStats = useMemo(() => {
    const c = normalized[scrubIdx];
    if (!c) return null;
    const peak = Math.max(...c, 0);
    const isBest = scrubIdx === bestIdx;
    const isWorst = scrubIdx === worstIdx;
    const tag = isBest ? "Best" : isWorst ? "Worst" : null;
    const threshold = peak * 0.05;
    const eff = Math.round((c.filter(v => v > threshold).length / c.length) * 100);
    const d2 = c.slice(1, -1).map((v, i) => Math.abs((c[i + 2] ?? v) - 2 * v + c[i]));
    const smooth = d2.length ? Math.max(1, Math.min(10, Math.round(10 - (d2.reduce((a, b) => a + b, 0) / d2.length / Math.max(peak, 1)) * 30))) : 5;
    return { peak: Math.round(peak), eff, smooth, tag };
  }, [normalized, scrubIdx, bestIdx, worstIdx]);

  if (!forceCurves.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Force Curve Analysis — {forceCurves.length} strokes
      </p>
      <div className="rounded-xl border border-gray-800 overflow-hidden" style={{ background: "#050d18" }}>
        {/* Main chart */}
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: 300, display: "block" }}
        />

        {/* Stroke stats */}
        {selectedStats && (
          <div className="grid grid-cols-4 gap-px" style={{ background: "#0f1929" }}>
            <div className="px-3 py-2 text-center" style={{ background: "#050d18" }}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Stroke</p>
              <p className="text-sm font-bold font-mono" style={{
                color: selectedStats.tag === "Best" ? "#f59e0b" : selectedStats.tag === "Worst" ? "#ef4444" : "#ffffff"
              }}>
                {scrubIdx + 1}{selectedStats.tag ? ` · ${selectedStats.tag}` : ""}
              </p>
            </div>
            <div className="px-3 py-2 text-center" style={{ background: "#050d18" }}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Peak Force</p>
              <p className="text-sm font-bold text-white font-mono">{selectedStats.peak}N</p>
            </div>
            <div className="px-3 py-2 text-center" style={{ background: "#050d18" }}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Efficiency</p>
              <p className="text-sm font-bold text-white font-mono">{selectedStats.eff}%</p>
            </div>
            <div className="px-3 py-2 text-center" style={{ background: "#050d18" }}>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Smoothness</p>
              <p className={`text-sm font-bold font-mono ${selectedStats.smooth >= 7 ? "text-green-400" : selectedStats.smooth >= 5 ? "text-yellow-400" : "text-red-400"}`}>
                {selectedStats.smooth}/10
              </p>
            </div>
          </div>
        )}

        {/* Sparkline + scrubber */}
        <div className="px-4 pb-4 pt-3" style={{ background: "#050d18" }}>
          <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">
            Peak Force Per Stroke — drag to scrub
          </p>
          <canvas
            ref={sparkRef}
            width={600}
            height={48}
            className="w-full rounded mb-3"
            style={{ height: 48, cursor: "pointer" }}
          />
          {forceCurves.length > 1 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-mono shrink-0 w-24">
                Stroke {scrubIdx + 1} / {forceCurves.length}
              </span>
              <input
                type="range"
                min={0}
                max={forceCurves.length - 1}
                value={scrubIdx}
                onChange={e => setScrubIdx(Number(e.target.value))}
                className="flex-1 accent-blue-500"
                style={{ height: 4 }}
              />
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setScrubIdx(bestIdx)}
                  className="text-[10px] px-2 py-0.5 rounded border border-yellow-700/40 text-yellow-400 hover:bg-yellow-900/30 transition-colors"
                >
                  Best
                </button>
                <button
                  onClick={() => setScrubIdx(worstIdx)}
                  className="text-[10px] px-2 py-0.5 rounded border border-red-700/40 text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  Worst
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
