import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

/*
 * PROTOCOL NOTE — Concept2 PM5 workout programming over CSAFE/BLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Every opcode, frame rule and enum value below is transcribed from the
 * "Concept2 PM Bluetooth Smart Interface Definition" (C2 physical/CSAFE
 * addendum). Nothing here is a Concept2-published JavaScript API — it is a
 * hand-rolled implementation of the wire format.
 *
 * ⚠ UNVERIFIED AGAINST REAL HARDWARE IN THIS REPO. No PM5 has been used to
 *   confirm that these frames are ACKed. The specific points that need a
 *   hardware check are:
 *     1. Byte order of PM-proprietary multi-byte values (SET_WORKOUTDURATION,
 *        SET_RESTDURATION, SET_SPLITDURATION). We send them MSB-first
 *        (big-endian); standard CSAFE data (e.g. CSAFE_SETHORIZONTAL_CMD) is
 *        LSB-first and is sent that way. If the PM NACKs, flip
 *        `PM_MULTIBYTE_BIG_ENDIAN` below.
 *     2. Whether interval count is honoured by repeating
 *        WORKOUTDURATION + RESTDURATION + CONFIGURE_WORKOUT(0) once per
 *        interval and committing with CONFIGURE_WORKOUT(1), which is what we
 *        do here.
 *     3. Whether the PM needs CSAFE_SETPROGRAM_CMD(slot 0) first (we send it)
 *        and whether it must be preceded by a CSAFE_GOIDLE/GOFINISHED.
 *     4. The inter-frame delay required by the monitor (we use 60 ms).
 *
 * Frame format:
 *   0xF1 <command bytes…> <checksum> 0xF2
 *   checksum = XOR of all command bytes (computed BEFORE stuffing)
 *   byte stuffing: any command/checksum byte in 0xF0–0xF3 is replaced by
 *   0xF3 followed by (byte - 0xF0). Start/stop flags are never stuffed.
 *
 * All frames produced here are ≤ 16 bytes, so they fit the default 20-byte
 * ATT payload without fragmentation.
 */

// ── GATT ─────────────────────────────────────────────────────────────────────
/** PM5 Control service. */
export const PM5_CONTROL_SERVICE = 'ce060020-43e5-11e4-916c-0800200c9a66';
/** Host → PM "receive" characteristic. Writes go here. */
export const PM5_CONTROL_RECEIVE_CHAR = 'ce060021-43e5-11e4-916c-0800200c9a66';

// ── CSAFE framing ────────────────────────────────────────────────────────────
const CSAFE_FRAME_START = 0xf1;
const CSAFE_FRAME_STOP = 0xf2;
const CSAFE_BYTE_STUFF = 0xf3;

// ── CSAFE public commands ────────────────────────────────────────────────────
const CSAFE_SETTWORK_CMD = 0x20;      // time target: hour, min, sec
const CSAFE_SETHORIZONTAL_CMD = 0x21; // distance target: uint16 LE + units
const CSAFE_SETPROGRAM_CMD = 0x24;    // select programmed workout slot
const CSAFE_UNITS_METERS = 0x24;

// ── CSAFE_SETUSERCFG1 (0x1A) — PM proprietary wrapper ────────────────────────
const CSAFE_SETUSERCFG1_CMD = 0x1a;
const CSAFE_PM_SET_WORKOUTTYPE = 0x01;
const CSAFE_PM_CONFIGURE_WORKOUT = 0x02;
const CSAFE_PM_SET_WORKOUTDURATION = 0x03;
const CSAFE_PM_SET_RESTDURATION = 0x04;
const CSAFE_PM_SET_SPLITDURATION = 0x05;

/** Workout type enum (CSAFE_PM_SET_WORKOUTTYPE payload). */
export const PM_WORKOUT_TYPE = {
  JustRowNoSplits: 0,
  JustRowSplits: 1,
  FixedDistNoSplits: 2,
  FixedDistSplits: 3,
  FixedTimeNoSplits: 4,
  FixedTimeSplits: 5,
  FixedTimeInterval: 6,
  FixedDistInterval: 7,
  VariableInterval: 8,
} as const;

/** Duration-type byte for SET_WORKOUTDURATION / SET_SPLITDURATION. */
const DURATION_TYPE_TIME = 0x00;     // value in 0.01 s units
const DURATION_TYPE_DISTANCE = 0x80; // value in metres

/** See PROTOCOL NOTE §1 — flip to false if the PM rejects these frames. */
const PM_MULTIBYTE_BIG_ENDIAN = true;

/** The PM5 drops back-to-back writes; space them out. */
const INTER_FRAME_DELAY_MS = 60;

// ── Limits (shared with the UI so validation matches what we can encode) ─────
export const MAX_DISTANCE_M = 100_000;
export const MAX_TIME_S = 24 * 60 * 60;
export const MAX_INTERVALS = 50;

// ── Public types ─────────────────────────────────────────────────────────────

interface WorkoutSpecBase {
  /**
   * Optional split length. Sent as CSAFE_PM_SET_SPLITDURATION with a *time*
   * duration type, i.e. "give me a split every N seconds". This is the only
   * split-related opcode in the PM proprietary set — it is NOT a target pace.
   */
  targetSplitSeconds?: number;
}

export type WorkoutSpec =
  | ({ kind: 'justrow' } & WorkoutSpecBase)
  | ({ kind: 'distance'; meters: number } & WorkoutSpecBase)
  | ({ kind: 'time'; seconds: number } & WorkoutSpecBase)
  | ({ kind: 'intervalDistance'; count: number; meters: number; restSeconds: number } & WorkoutSpecBase)
  | ({ kind: 'intervalTime'; count: number; workSeconds: number; restSeconds: number } & WorkoutSpecBase);

// ── Frame building (pure) ────────────────────────────────────────────────────

function pushStuffed(out: number[], byte: number): void {
  const b = byte & 0xff;
  if (b >= 0xf0 && b <= 0xf3) {
    out.push(CSAFE_BYTE_STUFF, b - 0xf0);
  } else {
    out.push(b);
  }
}

/**
 * Wrap raw CSAFE command bytes in a frame: start flag, byte-stuffed payload,
 * byte-stuffed XOR checksum, stop flag. Pure — no I/O, no platform checks.
 */
export function buildCsafeFrame(commandBytes: number[]): Uint8Array {
  let checksum = 0;
  for (const b of commandBytes) checksum ^= b & 0xff;

  const out: number[] = [CSAFE_FRAME_START];
  for (const b of commandBytes) pushStuffed(out, b);
  pushStuffed(out, checksum);
  out.push(CSAFE_FRAME_STOP);

  return new Uint8Array(out);
}

/** PM proprietary command wrapped in CSAFE_SETUSERCFG1_CMD with its length. */
function pmWrap(inner: number[]): number[] {
  return [CSAFE_SETUSERCFG1_CMD, inner.length, ...inner];
}

function u32(value: number): number[] {
  const v = Math.max(0, Math.round(value)) >>> 0;
  const be = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  return PM_MULTIBYTE_BIG_ENDIAN ? be : be.reverse();
}

function u16(value: number): number[] {
  const v = Math.max(0, Math.round(value)) & 0xffff;
  const be = [(v >>> 8) & 0xff, v & 0xff];
  return PM_MULTIBYTE_BIG_ENDIAN ? be : be.reverse();
}

function setProgramSlot0(): number[] {
  // [cmd, byte count, program number, 0x00]
  return [CSAFE_SETPROGRAM_CMD, 0x02, 0x00, 0x00];
}

function setWorkoutType(type: number): number[] {
  return pmWrap([CSAFE_PM_SET_WORKOUTTYPE, 0x01, type & 0xff]);
}

function setHorizontalMeters(meters: number): number[] {
  const m = Math.round(meters) & 0xffff;
  // Standard CSAFE data is LSB-first.
  return [CSAFE_SETHORIZONTAL_CMD, 0x03, m & 0xff, (m >>> 8) & 0xff, CSAFE_UNITS_METERS];
}

function setTimeWork(totalSeconds: number): number[] {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return [CSAFE_SETTWORK_CMD, 0x03, hours & 0xff, minutes & 0xff, seconds & 0xff];
}

function setWorkoutDurationTime(seconds: number): number[] {
  return pmWrap([CSAFE_PM_SET_WORKOUTDURATION, 0x05, DURATION_TYPE_TIME, ...u32(seconds * 100)]);
}

function setWorkoutDurationDistance(meters: number): number[] {
  return pmWrap([CSAFE_PM_SET_WORKOUTDURATION, 0x05, DURATION_TYPE_DISTANCE, ...u32(meters)]);
}

function setRestDuration(seconds: number): number[] {
  return pmWrap([CSAFE_PM_SET_RESTDURATION, 0x02, ...u16(seconds)]);
}

function setSplitDurationTime(seconds: number): number[] {
  return pmWrap([CSAFE_PM_SET_SPLITDURATION, 0x05, DURATION_TYPE_TIME, ...u32(seconds * 100)]);
}

/** 0 = another interval follows, 1 = commit the workout. */
function configureWorkout(commit: boolean): number[] {
  return pmWrap([CSAFE_PM_CONFIGURE_WORKOUT, 0x01, commit ? 0x01 : 0x00]);
}

function workoutTypeFor(spec: WorkoutSpec): number {
  const splits = !!spec.targetSplitSeconds;
  switch (spec.kind) {
    case 'justrow':          return splits ? PM_WORKOUT_TYPE.JustRowSplits : PM_WORKOUT_TYPE.JustRowNoSplits;
    case 'distance':         return splits ? PM_WORKOUT_TYPE.FixedDistSplits : PM_WORKOUT_TYPE.FixedDistNoSplits;
    case 'time':             return splits ? PM_WORKOUT_TYPE.FixedTimeSplits : PM_WORKOUT_TYPE.FixedTimeNoSplits;
    case 'intervalDistance': return PM_WORKOUT_TYPE.FixedDistInterval;
    case 'intervalTime':     return PM_WORKOUT_TYPE.FixedTimeInterval;
  }
}

/**
 * Validate a spec. Returns a human-readable reason, or null when the spec is
 * sendable. Shared with the UI so the Send button and the writer agree.
 */
export function validateWorkoutSpec(spec: WorkoutSpec): string | null {
  const positive = (n: number) => Number.isFinite(n) && n > 0;

  if (spec.targetSplitSeconds !== undefined) {
    if (!positive(spec.targetSplitSeconds)) return 'Split must be greater than zero.';
    if (spec.targetSplitSeconds > MAX_TIME_S) return 'Split must be under 24 hours.';
  }

  switch (spec.kind) {
    case 'justrow':
      return null;
    case 'distance':
      if (!positive(spec.meters)) return 'Enter a distance greater than zero.';
      if (spec.meters > MAX_DISTANCE_M) return `Distance must be ${MAX_DISTANCE_M.toLocaleString()} m or less.`;
      return null;
    case 'time':
      if (!positive(spec.seconds)) return 'Enter a time greater than zero.';
      if (spec.seconds > MAX_TIME_S) return 'Time must be under 24 hours.';
      return null;
    case 'intervalDistance':
      if (!Number.isFinite(spec.count) || spec.count < 1) return 'Use at least one interval.';
      if (spec.count > MAX_INTERVALS) return `Use ${MAX_INTERVALS} intervals or fewer.`;
      if (!positive(spec.meters)) return 'Enter a work distance greater than zero.';
      if (spec.meters > MAX_DISTANCE_M) return `Distance must be ${MAX_DISTANCE_M.toLocaleString()} m or less.`;
      if (!positive(spec.restSeconds)) return 'Enter a rest time greater than zero.';
      if (spec.restSeconds > MAX_TIME_S) return 'Rest must be under 24 hours.';
      return null;
    case 'intervalTime':
      if (!Number.isFinite(spec.count) || spec.count < 1) return 'Use at least one interval.';
      if (spec.count > MAX_INTERVALS) return `Use ${MAX_INTERVALS} intervals or fewer.`;
      if (!positive(spec.workSeconds)) return 'Enter a work time greater than zero.';
      if (spec.workSeconds > MAX_TIME_S) return 'Work time must be under 24 hours.';
      if (!positive(spec.restSeconds)) return 'Enter a rest time greater than zero.';
      if (spec.restSeconds > MAX_TIME_S) return 'Rest must be under 24 hours.';
      return null;
  }
}

/**
 * Build the ordered list of CSAFE frames that program `spec` onto the monitor.
 * Pure — safe to unit test without BLE or a native platform.
 */
export function buildWorkoutFrames(spec: WorkoutSpec): Uint8Array[] {
  const invalid = validateWorkoutSpec(spec);
  if (invalid) throw new Error(invalid);

  const commands: number[][] = [
    setProgramSlot0(),
    setWorkoutType(workoutTypeFor(spec)),
  ];

  switch (spec.kind) {
    case 'justrow':
      break;

    case 'distance':
      commands.push(setHorizontalMeters(spec.meters));
      break;

    case 'time':
      commands.push(setTimeWork(spec.seconds));
      break;

    case 'intervalDistance':
      for (let i = 0; i < spec.count; i++) {
        commands.push(setWorkoutDurationDistance(spec.meters));
        commands.push(setRestDuration(spec.restSeconds));
        commands.push(configureWorkout(false));
      }
      break;

    case 'intervalTime':
      for (let i = 0; i < spec.count; i++) {
        commands.push(setWorkoutDurationTime(spec.workSeconds));
        commands.push(setRestDuration(spec.restSeconds));
        commands.push(configureWorkout(false));
      }
      break;
  }

  if (spec.targetSplitSeconds) {
    commands.push(setSplitDurationTime(spec.targetSplitSeconds));
  }

  commands.push(configureWorkout(true));

  return commands.map(buildCsafeFrame);
}

/** Debug helper — "f1 24 02 00 00 26 f2". */
export function frameToHex(frame: Uint8Array): string {
  return Array.from(frame).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

// ── Transport ────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Program a workout onto a connected PM5. Native only — throws
 * `PM5_WRITE_UNSUPPORTED_PLATFORM` on web, where the Capacitor BLE plugin
 * cannot write to the control characteristic.
 */
export async function sendWorkoutToPM5(deviceId: string, spec: WorkoutSpec): Promise<void> {
  if (!Capacitor.isNativePlatform()) throw new Error('PM5_WRITE_UNSUPPORTED_PLATFORM');
  if (!deviceId) throw new Error('PM5_NOT_CONNECTED');

  const frames = buildWorkoutFrames(spec);

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    console.log(`[PM5 control] frame ${i + 1}/${frames.length}: ${frameToHex(frame)}`);
    await BleClient.write(
      deviceId,
      PM5_CONTROL_SERVICE,
      PM5_CONTROL_RECEIVE_CHAR,
      new DataView(frame.buffer, frame.byteOffset, frame.byteLength),
    );
    if (i < frames.length - 1) await delay(INTER_FRAME_DELAY_MS);
  }
}
