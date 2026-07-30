/**
 * Headless PM5 parsing + display-format tests — no hardware required.
 *
 *   npm run test:pm5
 *
 * Feeds mock DataViews built from known byte values through the real
 * src/lib/ble.ts parsers and the real src/lib/ergFormat.ts formatters that
 * LiveErgView renders with, then asserts the human-readable output matches
 * the PM5 screen (1:50 — not 110, not 110:00, not 100.00).
 */

import {
  parseCharacteristic,
  parseGeneralStatus,
  parseAdditionalStatus1,
  parseForceCurve,
  PM5_STATUS_CHAR,
  PM5_ADD1_CHAR,
  PM5_FORCE_CURVE_CHAR,
} from '../../src/lib/ble';
import {
  fmtTime,
  fmtPace,
  fmtWatts,
  fmtStrokeRate,
  fmtDistance,
  csToInterval,
} from '../../src/lib/ergFormat';

// ── Tiny assert harness ──────────────────────────────────────────────────────
let passed = 0;
const failures: string[] = [];
const notes: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e: any) {
    failures.push(`${name}: ${e?.message ?? e}`);
    console.log(`  FAIL  ${name}\n          ${e?.message ?? e}`);
  }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }
function eq(a: unknown, b: unknown, msg: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg} — got ${sa}, expected ${sb}`);
}
function note(msg: string) { notes.push(msg); }
function section(title: string) { console.log(`\n${title}`); }

/**
 * Build a DataView with specific bytes written at specific offsets.
 * `len` pads the frame out to a realistic notification length so the parsers'
 * byteLength guards behave the way they do on hardware.
 */
function frame(len: number, bytes: Record<number, number>): DataView {
  const buf = new Uint8Array(len);
  for (const [off, val] of Object.entries(bytes)) buf[Number(off)] = val;
  return new DataView(buf.buffer);
}

const hex = (dv: DataView) =>
  Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');

// ════════════════════════════════════════════════════════════════════════════
// TEST 1 — parsing produces correct human-readable output
// ════════════════════════════════════════════════════════════════════════════

section('TEST 1 — 0x0031 Rowing General Status');

// Case 1: bytes 6-7 = 0xDC 0x00 → split 1:50
check('0x0031 bytes 6-7 = DC 00 -> split displays "1:50"', () => {
  const dv = frame(14, { 6: 0xdc, 7: 0x00 });
  const p = parseCharacteristic(PM5_STATUS_CHAR, dv);
  // 0xDC = 220 raw; PM5 pace units are 0.5 s → 110.0 s → 11000 cs
  eq(p.splitPace, 11000, 'splitPace centiseconds');
  const shown = fmtPace(p.splitPace!);
  eq(shown, '1:50', 'display string');
  assert(shown !== '110' && shown !== '110:00', `bad format leaked: ${shown}`);
  console.log(`          hex[${hex(dv)}] raw=220 -> ${p.splitPace}cs -> "${shown}"`);
});

// Case 2 (corrected): the requested expectation "A4 00 -> 2:10" cannot hold at the
// same time as case 1 ("DC 00 -> 1:50"). 0xDC=220 -> 110 s fixes the wire unit at
// 0.5 s; 0xA4=164 is then 82 s = 1:22. A 2:10 split (130 s) is raw 260 = bytes 04 01.
// Both readings are asserted here so the display path is still covered end to end.
check('0x0031 bytes 6-7 = A4 00 -> split displays "1:22" (raw 164 x 0.5s)', () => {
  const dv = frame(14, { 6: 0xa4, 7: 0x00 });
  const p = parseCharacteristic(PM5_STATUS_CHAR, dv);
  eq(p.splitPace, 8200, 'splitPace centiseconds');
  const shown = fmtPace(p.splitPace!);
  console.log(`          hex[${hex(dv)}] raw=164 -> ${p.splitPace}cs -> "${shown}"`);
  eq(shown, '1:22', 'display string');
  assert(shown !== '82' && shown !== '82:00', `bad format leaked: ${shown}`);
  note(
    'Requested case "0x0031 bytes 6-7 = A4 00 -> 2:10" is inconsistent with the ' +
    'requested case "DC 00 -> 1:50": 220 -> 110 s pins the wire unit at 0.5 s, so ' +
    '164 -> 82 s = 1:22. Tested as 1:22, plus the 2:10 pair (04 01) below.'
  );
});

check('a 2:10 split (raw 260 = bytes 04 01) displays "2:10"', () => {
  const dv = frame(14, { 6: 0x04, 7: 0x01 });
  const p = parseCharacteristic(PM5_STATUS_CHAR, dv);
  eq(p.splitPace, 13000, 'splitPace centiseconds for a 130 s split');
  const shown = fmtPace(p.splitPace!);
  eq(shown, '2:10', 'display string');
  assert(shown !== '130' && shown !== '130:00', `bad format leaked: ${shown}`);
  console.log(`          hex[${hex(dv)}] raw=260 -> ${p.splitPace}cs -> "${shown}"`);
});

// Case 5: byte 8 = 0x1C → stroke rate 28
check('0x0031 byte 8 = 1C -> stroke rate displays "28"', () => {
  const dv = frame(14, { 8: 0x1c });
  const p = parseCharacteristic(PM5_STATUS_CHAR, dv);
  eq(p.strokeRate, 28, 'strokeRate');
  const shown = fmtStrokeRate(p.strokeRate!);
  eq(shown, '28 spm', 'display string');
  assert(!shown.includes('.'), `stroke rate must be an integer, got ${shown}`);
});

// Case 6: bytes 0-2 = 0x10 0x27 0x00 → elapsed 1:40
check('0x0031 bytes 0-2 = 10 27 00 -> elapsed displays "1:40"', () => {
  const dv = frame(14, { 0: 0x10, 1: 0x27, 2: 0x00 });
  const p = parseCharacteristic(PM5_STATUS_CHAR, dv);
  eq(p.elapsedTime, 10000, 'elapsedTime centiseconds');
  const shown = fmtTime(p.elapsedTime!);
  assert(shown !== '10000' && shown !== '100.00', `raw/seconds value leaked: ${shown}`);
  assert(shown.startsWith('1:40'), `expected 1:40 (+ optional tenths), got ${shown}`);
  eq(shown, '1:40.0', 'display string (PM5 shows tenths on elapsed time)');
  console.log(`          hex[${hex(dv)}] raw=10000cs -> "${shown}"`);
});

// Case 7: bytes 3-5 = 0xE8 0x03 0x00 → distance 100.0m
check('0x0031 bytes 3-5 = E8 03 00 -> distance displays "100.0m"', () => {
  const dv = frame(14, { 3: 0xe8, 4: 0x03, 5: 0x00 });
  const p = parseCharacteristic(PM5_STATUS_CHAR, dv);
  eq(p.distance, 100, 'distance metres (0.1 m wire units / 10)');
  const shown = fmtDistance(p.distance!);
  assert(shown !== '1000m' && shown !== '1000.0m', `unscaled 0.1 m units leaked: ${shown}`);
  eq(shown, '100.0m', 'display string');
  console.log(`          hex[${hex(dv)}] raw=1000 (0.1m) -> ${p.distance}m -> "${shown}"`);
});

section('TEST 1 — 0x0032 Rowing Additional Status');

// Case 3: bytes 5-6 = 0xC8 0x00 → watts 200
check('0x0032 bytes 5-6 = C8 00 -> watts displays "200"', () => {
  const dv = frame(10, { 5: 0xc8, 6: 0x00 });
  const p = parseCharacteristic(PM5_ADD1_CHAR, dv);
  eq(p.power, 200, 'power watts (direct uint16 read, not derived from pace)');
  const shown = fmtWatts(p.power!);
  eq(shown, '200 W', 'display string');
  assert(!shown.includes('.'), `watts must be an integer, got ${shown}`);
  console.log(`          hex[${hex(dv)}] -> ${p.power}W -> "${shown}"`);
});

// Case 4: bytes 3-4 = 0xDC 0x00 → split 1:50
check('0x0032 bytes 3-4 = DC 00 -> split displays "1:50"', () => {
  const dv = frame(10, { 3: 0xdc, 4: 0x00 });
  const p = parseCharacteristic(PM5_ADD1_CHAR, dv);
  eq(p.splitPace, 11000, 'splitPace centiseconds');
  eq(fmtPace(p.splitPace!), '1:50', 'display string');
});

section('TEST 1 — formatter round-trip (mm:ss, never raw seconds)');

check('fmtPace converts centiseconds to m:ss across the erg range', () => {
  const cases: Array<[number, string]> = [
    [11000, '1:50'],   // 110 s
    [13000, '2:10'],   // 130 s
    [12000, '2:00'],
    [9000,  '1:30'],
    [8200,  '1:22'],
    [20000, '3:20'],
    [6050,  '1:00'],   // 60.5 s truncates to 1:00, as the PM5 does
  ];
  for (const [cs, want] of cases) eq(fmtPace(cs), want, `${cs}cs`);
});

check('fmtPace never emits raw seconds or a mm:ss:ss hybrid', () => {
  for (let cs = 5000; cs <= 30000; cs += 137) {
    const s = fmtPace(cs);
    assert(/^\d+:\d{2}$/.test(s), `malformed pace "${s}" for ${cs}cs`);
    const secs = Number(s.split(':')[1]);
    assert(secs < 60, `seconds field ${secs} >= 60 in "${s}"`);
  }
});

check('fmtPace guards zero / garbage into "--:--"', () => {
  eq(fmtPace(0), '--:--', 'zero');
  eq(fmtPace(-1), '--:--', 'negative');
  eq(fmtPace(999999), '--:--', 'out of range');
});

check('fmtTime handles sub-hour and over-hour pieces', () => {
  eq(fmtTime(10000), '1:40.0', '1:40.0');
  eq(fmtTime(42350), '7:03.5', '7:03.5');
  eq(fmtTime(360000), '1:00:00.0', '60 min piece');
  eq(fmtTime(0), '0:00.0', 'zero');
});

check('csToInterval writes a Postgres-safe INTERVAL, not a display string', () => {
  // '1:50'::interval in Postgres is 1 hour 50 minutes — 60x too big.
  eq(csToInterval(11000), '00:01:50.00', '1:50 split');
  eq(csToInterval(45000), '00:07:30.00', '7:30 duration');
  eq(csToInterval(360000), '01:00:00.00', '60 min');
  assert(csToInterval(11000) !== fmtPace(11000), 'interval literal must differ from the display string');
});

// ════════════════════════════════════════════════════════════════════════════
// TEST 2 — force curve parses to human-readable newton values
// ════════════════════════════════════════════════════════════════════════════

section('TEST 2 — force curve (uint16 LE newtons)');

const FC_BYTES = [0x64, 0x00, 0xc8, 0x00, 0x2c, 0x01];
const FC_DV = new DataView(new Uint8Array(FC_BYTES).buffer);

check('parseCharacteristic(force curve UUID) returns [100, 200, 300]', () => {
  const out = parseCharacteristic(PM5_FORCE_CURVE_CHAR, FC_DV);
  eq(Object.keys(out), ['forceCurve'], 'unexpected keys on the result');
  eq(out.forceCurve, [100, 200, 300], 'parsed newtons');
  console.log(`          hex[${hex(FC_DV)}] -> ${JSON.stringify(out.forceCurve)} N`);
});

check('values are plain numbers (not bytes, not strings) in a plausible N range', () => {
  const out = parseForceCurve(FC_DV);
  out.forEach((v, i) => {
    assert(typeof v === 'number', `sample ${i} is ${typeof v}, not number`);
    assert(Number.isInteger(v) && Number.isFinite(v), `sample ${i} not a finite integer: ${v}`);
    assert(v >= 0 && v <= 800, `sample ${i} = ${v} N outside the 0-800 N stroke range`);
  });
  // Raw-byte misreads would surface as 6 samples or as big-endian garbage.
  assert(out.length === 3, `expected 3 uint16 samples from 6 bytes, got ${out.length}`);
  const be: number[] = [];
  for (let i = 0; i + 1 < FC_DV.byteLength; i += 2) be.push(FC_DV.getUint16(i, false));
  eq(be, [25600, 51200, 11265], 'big-endian control values');
  assert(Math.max(...be) > 800, 'endianness regression guard is not meaningful');
});

check('display of newton values carries no decimals or units in the number', () => {
  const out = parseForceCurve(FC_DV);
  const shown = out.map(v => `${v}N`);
  eq(shown, ['100N', '200N', '300N'], 'rendered newtons');
});

// ════════════════════════════════════════════════════════════════════════════
// Cross-checks on the parsers' arithmetic (documents the pace scaling)
// ════════════════════════════════════════════════════════════════════════════

section('Pace scaling consistency (0.5 s wire units)');

check('the same raw pace value yields the same split in 0x0031 and 0x0032', () => {
  for (const raw of [200, 220, 240, 260, 300]) {
    const lo = raw & 0xff, hi = (raw >> 8) & 0xff;
    const g = parseGeneralStatus(frame(14, { 6: lo, 7: hi })).splitPace;
    const a = parseAdditionalStatus1(frame(10, { 3: lo, 4: hi })).splitPace;
    eq(g, a, `raw=${raw}: 0x0031 vs 0x0032 disagree`);
    eq(g, raw * 50, `raw=${raw}: expected raw*50 centiseconds`);
  }
});

check('raw pace -> display mapping is monotonic and self-consistent', () => {
  const rows = [200, 220, 240, 260, 280].map(raw => {
    const cs = parseGeneralStatus(frame(14, { 6: raw & 0xff, 7: raw >> 8 })).splitPace!;
    return { raw, cs, shown: fmtPace(cs) };
  });
  rows.forEach(r => console.log(`          raw ${r.raw} -> ${r.cs}cs -> ${r.shown}`));
  eq(rows.map(r => r.shown), ['1:40', '1:50', '2:00', '2:10', '2:20'], 'pace ladder');
  note(
    'Pace scaling is raw x 0.5 s. Under that scaling a 2:10 split (130 s) is raw 260 ' +
    '= bytes 04 01, not A4 00. Bytes A4 00 (raw 164) are a 1:22 split.'
  );
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'-'.repeat(72)}`);
console.log(`${passed} passed, ${failures.length} failed`);
if (notes.length) {
  console.log('\nNotes:');
  notes.forEach(n => console.log(`  * ${n}`));
}
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  FAIL ${f}`));
  process.exit(1);
}
