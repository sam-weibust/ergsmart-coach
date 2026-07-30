/**
 * Headless force-curve test harness — no PM5 hardware required.
 *
 * Run:  npx sucrase-node scripts/test-force-curve.ts
 *   or:  npm run test:force-curve
 *
 * What it covers:
 *   1. src/lib/ble.ts   — parseCharacteristic / parseForceCurve / parseForceCurveLegacy
 *                         / toDataView against mock PM5 notifications.
 *   2. ForceCurveCanvas — computeStats + the canvas draw path (recording 2D ctx stub)
 *                         + a full server-side React render.
 *   3. LiveErgView      — the recharts <AreaChart> force-curve panel, rendered with the
 *                         same data mapping the component uses (src/components/dashboard/
 *                         LiveErgView.tsx force curve area chart).
 */

import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { AreaChart, Area, XAxis, YAxis } from 'recharts';

import {
  buildForceCurveAreaData,
  forceCurveAxisMax,
  FORCE_AXIS_EMPTY_POINTS,
  type ForcePoint,
} from '../../src/lib/forceCurve';
import {
  parseCharacteristic,
  parseForceCurve,
  parseForceCurveLegacy,
  toDataView,
  PM5_FORCE_CURVE_CHAR,
  PM5_FORCE_CURVE_LEGACY,
  PM5_STATUS_CHAR,
} from '../../src/lib/ble';

import ForceCurveCanvas from '../../src/components/dashboard/ForceCurveCanvas';
import {
  computeStats,
  drawCurve,
  drawGrid,
  buildIdealCurve,
} from '../../src/lib/forceCurveDraw';

// ── Tiny assert harness ──────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];
const notes: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failures.push(`${name}: ${e?.message ?? e}`);
    console.log(`  ✗ ${name}\n      ${e?.message ?? e}`);
  }
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg} — got ${sa}, expected ${sb}`);
}
function note(msg: string) { notes.push(msg); }
function section(title: string) { console.log(`\n${title}`); }

// ── Mock stroke force curve ──────────────────────────────────────────────────
// Deterministic (no Math.random) so failures are reproducible.
// Fast rise to a peak at ~33% of the drive, slower decay — the shape a PM5 sends.
function makeStrokeCurve(n = 25, min = 50, peak = 600): number[] {
  const peakIdx = Math.max(1, Math.round(n * 0.33));
  return Array.from({ length: n }, (_, i) => {
    const shape = i <= peakIdx
      ? Math.sin((i / peakIdx) * (Math.PI / 2))
      : Math.pow(Math.cos(((i - peakIdx) / (n - 1 - peakIdx)) * (Math.PI / 2)), 1.4);
    const jitter = ((i * 37) % 7) - 3;           // deterministic ±3 N ripple
    const v = min + (peak - min) * shape + jitter * 2;
    return Math.max(0, Math.min(65535, Math.round(v)));
  });
}

// uint16 little-endian encoder → DataView, as the PM5 notification arrives.
function encodeLE16(values: number[], opts: { offset?: number; trailingOddByte?: boolean } = {}): DataView {
  const offset = opts.offset ?? 0;
  const extra = opts.trailingOddByte ? 1 : 0;
  const buf = new ArrayBuffer(offset + values.length * 2 + extra);
  const dv = new DataView(buf, offset, values.length * 2 + extra);
  values.forEach((v, i) => dv.setUint16(i * 2, v, true));
  if (opts.trailingOddByte) dv.setUint8(values.length * 2, 0x2a);
  return dv;
}

function toBase64(dv: DataView): string {
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  return Buffer.from(bytes).toString('base64');
}

const CURVE = makeStrokeCurve(25);
const DV = encodeLE16(CURVE);

// ── 1. Parsing ───────────────────────────────────────────────────────────────
section('parseCharacteristic — force curve (ce060393, uint16 LE)');

check('returns { forceCurve } and nothing else for the force-curve UUID', () => {
  const out = parseCharacteristic(PM5_FORCE_CURVE_CHAR, DV);
  eq(Object.keys(out), ['forceCurve'], 'unexpected keys');
  assert(Array.isArray(out.forceCurve), 'forceCurve is not an array');
});

check('round-trips the exact mock values', () => {
  const out = parseCharacteristic(PM5_FORCE_CURVE_CHAR, DV).forceCurve!;
  eq(out, CURVE, 'parsed values differ from encoded values');
});

check('every element is a finite non-negative integer in the 0–800 N range', () => {
  const out = parseCharacteristic(PM5_FORCE_CURVE_CHAR, DV).forceCurve!;
  out.forEach((v, i) => {
    assert(typeof v === 'number' && Number.isFinite(v), `sample ${i} is not a finite number: ${v}`);
    assert(Number.isInteger(v), `sample ${i} is not an integer: ${v}`);
    assert(v >= 0 && v <= 800, `sample ${i} out of 0–800 N range: ${v}`);
  });
});

check('sample count matches the notification length for 15/25/32/40-sample strokes', () => {
  for (const n of [15, 25, 32, 40]) {
    const c = makeStrokeCurve(n);
    const out = parseForceCurve(encodeLE16(c));
    assert(out.length === n, `n=${n}: got ${out.length} samples`);
    eq(out, c, `n=${n} values`);
  }
});

check('peak / shape survive parsing (peak in first half, 400–700 N)', () => {
  const out = parseForceCurve(DV);
  const peak = Math.max(...out);
  const peakIdx = out.indexOf(peak);
  assert(peak >= 400 && peak <= 700, `peak ${peak} N outside 400–700`);
  assert(peakIdx > 0 && peakIdx < out.length / 2, `peak index ${peakIdx} not in first half`);
  assert(out[0] < peak * 0.3, `first sample ${out[0]} too close to peak — catch looks wrong`);
});

check('little-endian: a big-endian read would NOT produce these values', () => {
  const be: number[] = [];
  for (let i = 0; i + 1 < DV.byteLength; i += 2) be.push(DV.getUint16(i, false));
  const le = parseForceCurve(DV);
  assert(JSON.stringify(be) !== JSON.stringify(le), 'endianness is untestable with this data');
  assert(Math.max(...be) > 800, 'big-endian misparse should blow past the 0–800 N range');
});

check('UUID matching is case-insensitive', () => {
  const out = parseCharacteristic(PM5_FORCE_CURVE_CHAR.toUpperCase(), DV);
  eq(out.forceCurve, CURVE, 'uppercase UUID did not dispatch to the force-curve parser');
});

check('honours a non-zero DataView byteOffset (plugin-supplied subarrays)', () => {
  const dv = encodeLE16(CURVE, { offset: 3 });
  assert(dv.byteOffset === 3, 'test setup: byteOffset not applied');
  eq(parseForceCurve(dv), CURVE, 'offset view parsed incorrectly');
});

check('odd trailing byte is dropped, not misaligned', () => {
  const dv = encodeLE16(CURVE, { trailingOddByte: true });
  const out = parseForceCurve(dv);
  assert(out.length === CURVE.length, `expected ${CURVE.length} samples, got ${out.length}`);
  eq(out, CURVE, 'odd-length payload shifted the samples');
});

check('empty / 1-byte payloads return [] instead of throwing', () => {
  eq(parseForceCurve(new DataView(new ArrayBuffer(0))), [], 'empty payload');
  eq(parseForceCurve(new DataView(new ArrayBuffer(1))), [], '1-byte payload');
  eq(parseCharacteristic(PM5_FORCE_CURVE_CHAR, new DataView(new ArrayBuffer(0))).forceCurve, [], 'via dispatch');
});

check('non-force-curve UUID never yields a forceCurve key', () => {
  const statusDv = new DataView(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer);
  const out = parseCharacteristic(PM5_STATUS_CHAR, statusDv) as any;
  assert(!('forceCurve' in out), 'status parse leaked a forceCurve key');
  eq(parseCharacteristic('deadbeef-0000-0000-0000-000000000000', DV), {}, 'unknown UUID');
});

section('parseForceCurveLegacy — fallback (ce060035, uint8)');

check('reads one sample per byte', () => {
  const bytes = [12, 80, 200, 255, 40, 0];
  const dv = new DataView(new Uint8Array(bytes).buffer);
  eq(parseForceCurveLegacy(dv), bytes, 'uint8 parse');
});

check('uint16 payload fed to the legacy parser produces garbage (documents the risk)', () => {
  const out = parseForceCurveLegacy(DV);
  assert(out.length === CURVE.length * 2, 'legacy parser should see 2× the samples');
  assert(JSON.stringify(out) !== JSON.stringify(CURVE), 'legacy parse unexpectedly matched');
  note(
    'Legacy fallback ce060035 parses uint8 — if that characteristic actually carries ' +
    'uint16 data, the curve silently doubles in length and halves in amplitude. ' +
    'Only reachable when ce060393 subscription fails.'
  );
});

section('toDataView — plugin payload shapes');

check('base64 string (Capacitor/Android delivery) parses identically', () => {
  eq(parseForceCurve(toDataView(toBase64(DV))), CURVE, 'base64 path');
});

check('Uint8Array subarray keeps its window', () => {
  const full = new Uint8Array(4 + DV.byteLength);
  full.set(new Uint8Array(DV.buffer, DV.byteOffset, DV.byteLength), 4);
  eq(parseForceCurve(toDataView(full.subarray(4))), CURVE, 'subarray path');
});

check('ArrayBuffer + { buffer } wrapper paths parse', () => {
  const ab = new Uint8Array(new Uint8Array(DV.buffer, DV.byteOffset, DV.byteLength)).buffer;
  eq(parseForceCurve(toDataView(ab)), CURVE, 'ArrayBuffer path');
  eq(parseForceCurve(toDataView({ buffer: ab })), CURVE, '{ buffer } path');
});

// ── 2. ForceCurveCanvas ──────────────────────────────────────────────────────
section('ForceCurveCanvas — stats');

check('computeStats on the parsed curve is sane', () => {
  const forces = parseForceCurve(DV);
  const s = computeStats(forces, 85 /* cs drive */, 140 /* cs recovery */)!;
  assert(s !== null, 'stats were null');
  assert(s.peakForce === Math.max(...forces), `peakForce ${s.peakForce} != ${Math.max(...forces)}`);
  assert(s.timeToPeak !== null && s.timeToPeak! > 0 && s.timeToPeak! < 850,
    `timeToPeak ${s.timeToPeak}ms outside 0–850ms drive`);
  assert(s.driveEfficiency > 50 && s.driveEfficiency <= 100, `driveEfficiency ${s.driveEfficiency}%`);
  assert(s.smoothness >= 1 && s.smoothness <= 10, `smoothness ${s.smoothness} out of 1–10`);
  assert(s.catchSlip === false, 'clean curve flagged as catch slip');
  console.log(`      stats: ${JSON.stringify(s)}`);
});

check('computeStats tolerates degenerate curves', () => {
  eq(computeStats([], 85), null, 'empty curve');
  const one = computeStats([300], 85)!;
  assert(Number.isFinite(one.peakForce) && Number.isFinite(one.driveEfficiency), 'single sample → NaN');
  const zeros = computeStats([0, 0, 0, 0], 85)!;
  assert(Number.isFinite(zeros.smoothness) && Number.isFinite(zeros.driveEfficiency), 'all-zero → NaN');
  const noDrive = computeStats([10, 200, 400, 100])!;
  assert(noDrive.timeToPeak === null, 'timeToPeak should be null without driveTime');
});

section('ForceCurveCanvas — canvas draw path (recording 2D context)');

// Minimal recording stand-in for CanvasRenderingContext2D.
function makeCtxStub() {
  const pts: Array<{ op: string; x: number; y: number }> = [];
  const bad: string[] = [];
  const ctx: any = {
    canvas: { width: 0, height: 0 },
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1,
    lineJoin: '', lineCap: '', font: '', textAlign: '',
    save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {}, closePath() {},
    clearRect() {}, fillRect() {}, setLineDash() {}, scale() {}, translate() {},
    rotate() {}, setTransform() {}, createLinearGradient() { return { addColorStop() {} }; },
    moveTo(x: number, y: number) { record('moveTo', x, y); },
    lineTo(x: number, y: number) { record('lineTo', x, y); },
    fillText(t: string, x: number, y: number) {
      if (!Number.isFinite(x) || !Number.isFinite(y) || typeof t !== 'string' || /NaN|Infinity/.test(t)) {
        bad.push(`fillText("${t}", ${x}, ${y})`);
      }
    },
  };
  function record(op: string, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) bad.push(`${op}(${x}, ${y})`);
    pts.push({ op, x, y });
  }
  return { ctx: ctx as CanvasRenderingContext2D, pts, bad };
}

const W = 600, H = 300;

check('drawCurve emits finite in-bounds coordinates for 15–40 sample curves', () => {
  for (const n of [15, 25, 32, 40]) {
    const forces = parseForceCurve(encodeLE16(makeStrokeCurve(n)));
    const maxN = Math.max(...forces, 100) * 1.15;
    const { ctx, pts, bad } = makeCtxStub();
    drawCurve(ctx, W, H, forces, maxN, '#60a5fa', 2.5, 1);
    assert(bad.length === 0, `n=${n}: non-finite coords → ${bad.slice(0, 3).join(', ')}`);
    assert(pts.length === n, `n=${n}: expected ${n} points, drew ${pts.length}`);
    for (const p of pts) {
      assert(p.x >= 0 && p.x <= W, `n=${n}: x ${p.x} outside canvas`);
      assert(p.y >= 0 && p.y <= H, `n=${n}: y ${p.y} outside canvas`);
    }
    // Peak of the curve must map to the highest point (smallest y).
    const peakIdx = forces.indexOf(Math.max(...forces));
    const minY = Math.min(...pts.map(p => p.y));
    assert(Math.abs(pts[peakIdx].y - minY) < 0.001, `n=${n}: peak sample is not the top of the plot`);
  }
});

check('drawCurve is a no-op for empty / single-sample curves (no NaN)', () => {
  for (const data of [[], [420]]) {
    const { ctx, pts, bad } = makeCtxStub();
    drawCurve(ctx, W, H, data, 700, '#fff', 2);
    assert(pts.length === 0 && bad.length === 0, `data=${JSON.stringify(data)} drew ${pts.length} pts / ${bad.length} bad`);
  }
});

check('drawGrid + buildIdealCurve produce finite geometry and labels', () => {
  const forces = parseForceCurve(DV);
  const maxN = Math.max(...forces, 100) * 1.15;
  const { ctx, bad } = makeCtxStub();
  drawGrid(ctx, W, H, Math.round(maxN));
  const ideal = buildIdealCurve(forces.length, maxN / 1.15);
  assert(ideal.length === forces.length, 'ideal curve length mismatch');
  ideal.forEach((v, i) => assert(Number.isFinite(v) && v >= 0, `ideal[${i}] = ${v}`));
  drawCurve(ctx, W, H, ideal, maxN, '#334155', 1.5, 0.7, true, [4, 4]);
  assert(bad.length === 0, `non-finite grid/ideal output → ${bad.slice(0, 3).join(', ')}`);
});

check('prev-curve resampling (different stroke lengths) stays finite', () => {
  // Mirrors the resample block in ForceCurveCanvas.draw()
  const current = parseForceCurve(encodeLE16(makeStrokeCurve(25)));
  for (const prevLen of [15, 24, 26, 40, 1]) {
    const prev = parseForceCurve(encodeLE16(makeStrokeCurve(prevLen)));
    const resampled = Array.from({ length: current.length }, (_, i) => {
      const t = (i / (current.length - 1)) * (prev.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(Math.ceil(t), prev.length - 1);
      return prev[lo] + (prev[hi] - prev[lo]) * (t - lo);
    });
    resampled.forEach((v, i) => assert(Number.isFinite(v), `prevLen=${prevLen}: resampled[${i}] = ${v}`));
    const { ctx, bad } = makeCtxStub();
    drawCurve(ctx, W, H, resampled, Math.max(...current, ...prev) * 1.15, '#3b82f6', 2, 0.3);
    assert(bad.length === 0, `prevLen=${prevLen}: bad coords ${bad.slice(0, 2).join(', ')}`);
  }
});

section('ForceCurveCanvas — React render (react-dom/server)');

// React SSR splits interpolated text with `<!-- -->` markers — strip them so
// text assertions match what the browser actually shows.
const flat = (html: string) => html.replace(/<!-- -->/g, '');

check('renders with mock curve data without throwing', () => {
  const curves = [makeStrokeCurve(25, 45, 560), makeStrokeCurve(25, 50, 600), makeStrokeCurve(25, 55, 620)]
    .map(c => parseForceCurve(encodeLE16(c)));
  const html = flat(renderToString(
    React.createElement(ForceCurveCanvas, {
      currentCurve: curves[2],
      prevCurve: curves[1],
      allCurves: curves,
      driveTime: 85,
      recoveryTime: 140,
      strokeCount: curves.length,
    })
  ));
  const stats = computeStats(curves[2], 85, 140)!;
  assert(html.includes('<canvas'), 'no <canvas> in output');
  assert(html.includes('Peak Force'), 'metrics row missing');
  assert(html.includes(`${stats.peakForce}N`), `peak force ${stats.peakForce}N not rendered`);
  assert(html.includes('3 strokes'), 'stroke count not rendered');
  assert(html.includes('Peak Force / Stroke'), 'sparkline missing for 3 curves');
  assert(!/NaN|undefined/.test(html), `render contains NaN/undefined: ${html.match(/.{0,40}(NaN|undefined).{0,40}/)?.[0]}`);
});

check('renders with a single stroke and with empty curves', () => {
  const one = parseForceCurve(DV);
  const single = flat(renderToString(React.createElement(ForceCurveCanvas, {
    currentCurve: one, prevCurve: [], allCurves: [one], driveTime: 85, recoveryTime: 140, strokeCount: 1,
  })));
  assert(single.includes('1 stroke<'), 'singular stroke label missing');
  assert(!single.includes('Peak Force / Stroke'), 'sparkline should be hidden for 1 stroke');
  const empty = flat(renderToString(React.createElement(ForceCurveCanvas, {
    currentCurve: [], prevCurve: [], allCurves: [], strokeCount: 0,
  })));
  assert(empty.includes('<canvas'), 'empty state did not render a canvas');
  assert(!/NaN/.test(empty), 'empty state rendered NaN');
});

// ── 3. LiveErgView force-curve AreaChart ─────────────────────────────────────
section('LiveErgView — recharts <AreaChart> force curve panel');

// The real helpers LiveErgView renders with (src/lib/forceCurve.ts).
const areaData = buildForceCurveAreaData;
const CHART_TOP_MARGIN = 4;

function renderAreaChart(data: ForcePoint[], domainMax: any = forceCurveAxisMax) {
  return renderToString(
    React.createElement(
      AreaChart as any,
      { data, width: 600, height: 128, margin: { top: CHART_TOP_MARGIN, right: 4, left: 4, bottom: 4 } },
      React.createElement(YAxis as any, { domain: [0, domainMax], hide: true }),
      React.createElement(XAxis as any, { dataKey: 'idx', hide: true }),
      React.createElement(Area as any, {
        type: 'monotone', dataKey: 'force', stroke: '#2272FF', strokeWidth: 2,
        fill: '#2272FF', fillOpacity: 0.2, dot: false, isAnimationActive: false,
      })
    )
  );
}

check('renders the parsed curve as an SVG area path', () => {
  const data = areaData(parseForceCurve(DV));
  assert(data.length === CURVE.length, `mapped ${data.length} points, expected ${CURVE.length}`);
  const html = renderAreaChart(data);
  assert(html.includes('<svg'), 'no <svg> emitted');
  const d = html.match(/class="recharts-curve recharts-area-curve"[^>]*\bd="([^"]+)"/)?.[1]
        ?? html.match(/<path[^>]*\bd="(M[^"]+)"/)?.[1];
  assert(!!d, 'no area path drawn');
  assert(!/NaN/.test(d!), `path contains NaN: ${d!.slice(0, 80)}`);
  const yVals = [...d!.matchAll(/[ML,](-?[\d.]+),(-?[\d.]+)/g)].map(m => parseFloat(m[2]));
  assert(yVals.length > 0 && yVals.every(Number.isFinite), 'path y values not finite');
  console.log(`      area path: ${d!.slice(0, 70)}…`);
});

check('empty state renders a flat 20-point baseline (no crash, no blank chart)', () => {
  const data = areaData([]);
  eq(data.length, FORCE_AXIS_EMPTY_POINTS, 'empty-state point count');
  assert(data.every(p => p.force === 0), 'empty-state baseline is not zero');
  const html = renderAreaChart(data);
  assert(html.includes('<svg') && !/NaN/.test(html), 'empty-state chart broken');
});

// Recharts clamps samples outside the Y domain to the edge of the plot area, so a
// too-small domain shows a flat plateau instead of the real peak.
function topPlateauCount(html: string): { plateau: number; total: number } {
  const d = html.match(/<path[^>]*\bd="(M[^"]+)"/)?.[1];
  assert(!!d && !/NaN/.test(d!), 'chart path missing or contains NaN');
  const yVals = [...d!.matchAll(/[MLC,](-?[\d.]+),(-?[\d.]+)/g)].map(m => parseFloat(m[2]));
  assert(yVals.length > 0 && yVals.every(Number.isFinite), 'path y values not finite');
  return { plateau: yVals.filter(y => y <= CHART_TOP_MARGIN + 0.001).length, total: yVals.length };
}

check('a fixed [0,800] domain WOULD clamp a >800 N stroke (regression guard)', () => {
  const heavy = parseForceCurve(encodeLE16(makeStrokeCurve(25, 60, 1000)));
  assert(Math.max(...heavy) > 800, 'test setup: mock peak is not above 800 N');
  const { plateau, total } = topPlateauCount(renderAreaChart(areaData(heavy), 800));
  assert(plateau > 1, `expected clamping with a fixed 800 N ceiling, got ${plateau}/${total} points at the top`);
});

check('forceCurveAxisMax grows the axis so big strokes are not clamped', () => {
  eq(forceCurveAxisMax(598), 800, 'ordinary stroke keeps the 800 N baseline');
  eq(forceCurveAxisMax(1004), 1100, 'axis rounds up to the next 100 N');
  eq(forceCurveAxisMax(NaN), 800, 'non-finite dataMax falls back to 800 N');
  for (const peak of [600, 800, 1000, 1400]) {
    const curve = parseForceCurve(encodeLE16(makeStrokeCurve(25, 60, peak)));
    const { plateau, total } = topPlateauCount(renderAreaChart(areaData(curve)));
    assert(plateau <= 1, `peak ${peak} N: ${plateau}/${total} points flattened against the axis top`);
  }
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(72)}`);
console.log(`Parsed curve (${CURVE.length} samples, N): ${JSON.stringify(parseForceCurve(DV))}`);
console.log(`Peak ${Math.max(...CURVE)} N @ index ${CURVE.indexOf(Math.max(...CURVE))}  |  min ${Math.min(...CURVE)} N`);
console.log(`${passed} passed, ${failures.length} failed`);
if (notes.length) {
  console.log('\nNotes:');
  notes.forEach(n => console.log(`  • ${n}`));
}
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
}
