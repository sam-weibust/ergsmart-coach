/**
 * Pure force-curve drawing + analysis helpers used by
 * src/components/dashboard/ForceCurveCanvas.tsx.
 *
 * Kept out of the component file so they can be unit-tested headlessly
 * (scripts/test/force-curve.ts) without breaking React Fast Refresh.
 */

// ── Ideal bell curve generator ────────────────────────────────────────────────
export function buildIdealCurve(len: number, peakVal: number): number[] {
  const peakIdx = Math.round(len * 0.33);
  const sigma = len * 0.22;
  return Array.from({ length: len }, (_, i) =>
    peakVal * Math.exp(-0.5 * Math.pow((i - peakIdx) / sigma, 2))
  );
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
export const PAD = { top: 28, right: 24, bottom: 48, left: 56 };

export function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number, maxN: number) {
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  ctx.strokeStyle = "#E2E1E9";
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
    ctx.fillStyle = "#6B6B7D";
    ctx.font = "10px 'Proxima Nova', system-ui, sans-serif";
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
    ctx.fillStyle = "#6B6B7D";
    ctx.font = "10px 'Proxima Nova', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${pct}%`, x, PAD.top + iH + 16);
  }

  // Axis labels
  ctx.fillStyle = "#6B6B7D";
  ctx.font = "10px 'Proxima Nova', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Drive Phase", PAD.left + iW / 2, H - 4);

  ctx.save();
  ctx.translate(12, PAD.top + iH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Force (N)", 0, 0);
  ctx.restore();
}

export function drawCurve(
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
export function computeStats(curve: number[], driveTime?: number, recoveryTime?: number) {
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
