import { Capacitor } from '@capacitor/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';

// ── PM5 GATT UUIDs ──────────────────────────────────────────────────────────
export const PM5_SERVICE        = 'ce060000-43e5-11e4-916c-0800200c9a66';
export const PM5_ROWING_SERVICE = 'ce060030-43e5-11e4-916c-0800200c9a66';
export const PM5_STATUS_CHAR    = 'ce060031-43e5-11e4-916c-0800200c9a66';
export const PM5_ADD1_CHAR      = 'ce060032-43e5-11e4-916c-0800200c9a66';
export const PM5_ADD2_CHAR      = 'ce060033-43e5-11e4-916c-0800200c9a66';
export const PM5_STROKE_CHAR    = 'ce060034-43e5-11e4-916c-0800200c9a66';
// Per user spec: force curve characteristic UUID
export const PM5_FORCE_CURVE_CHAR = 'ce060393-43e5-11e4-916c-0800200c9a66';
// Legacy fallback force curve UUID (Concept2 standard 0x0035)
export const PM5_FORCE_CURVE_LEGACY = 'ce060035-43e5-11e4-916c-0800200c9a66';

// ── Heart Rate UUIDs ─────────────────────────────────────────────────────────
export const HR_SERVICE     = '0000180d-0000-1000-8000-00805f9b34fb';
export const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

// ── Data Types ───────────────────────────────────────────────────────────────

export interface BleDevice {
  deviceId: string;
  name: string;
  rssi?: number;
  isPM5?: boolean;
  isHR?: boolean;
}

export interface PM5StreamData {
  elapsedTime: number | null;   // centiseconds (0.01s units)
  distance: number | null;       // metres
  workoutState: number | null;   // 0=Idle 1=Countdown 2=Rowing 3=Paused 4=Finished
  strokeRate: number | null;     // spm
  heartRate: number | null;      // bpm
  calories: number | null;
  splitPace: number | null;      // centiseconds per 500m
  power: number | null;          // watts
  driveLength: number | null;    // centimetres
  driveTime: number | null;      // centiseconds
  recoveryTime: number | null;   // centiseconds
  strokeDistance: number | null;
  strokeCount: number | null;
  averagePace: number | null;    // centiseconds per 500m
}

export type StreamCallback = (data: Partial<PM5StreamData>) => void;
export type DisconnectCallback = () => void;

// ── Init result types ────────────────────────────────────────────────────────

export type BleInitStatus = 'ready' | 'permission_denied' | 'bluetooth_off' | 'error' | 'web';

export interface InitResult {
  ok: boolean;
  status: BleInitStatus;
  error?: string;
}

// ── Debug counters (log first 20 strokes per char for field verification) ────
const _dbg: Record<string, number> = {};
function _log(tag: string, dv: DataView, parsed: object) {
  _dbg[tag] = (_dbg[tag] ?? 0) + 1;
  if (_dbg[tag] > 20) return;
  const hex = Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`[PM5 ${tag}] #${_dbg[tag]} hex: ${hex} | parsed:`, parsed);
}

// ── Range validation (log suspicious values) ─────────────────────────────────
let _distanceWarned = false;
let _lastDistance = 0;
function _validateAndLog(field: string, value: number, min: number, max: number) {
  if (value > 0 && (value < min || value > max)) {
    console.warn(`[PM5 SUSPICIOUS ${field}] value ${value} outside expected range [${min}, ${max}]`);
  }
}

// ── Parsing — User's exact byte offsets ──────────────────────────────────────

// 0x0031 – Rowing General Status
// Per user spec:
//  0-2: Elapsed time (uint24 LE, 0.01s)
//  3-5: Distance (uint24 LE, 0.1m)
//  6-7: Drive pace (uint16 LE, 0.5s/500m units)
//  8:   Stroke rate (uint8, spm)
//  9-10: Heart rate (uint16 LE, bpm)
// Plus workoutState preserved from PM5 spec (byte 10 of full message — read with bounds)
export function parseGeneralStatus(dv: DataView): Partial<PM5StreamData> {
  if (dv.byteLength < 9) return {};
  try {
    // Elapsed time: bytes 0-2 as uint24 little-endian (0.01s)
    const elapsedTime = dv.getUint8(0) + dv.getUint8(1) * 256 + dv.getUint8(2) * 65536;

    // Distance: bytes 3-5 as uint24 little-endian (0.1m units → m)
    const rawDistance = dv.getUint8(3) + dv.getUint8(4) * 256 + dv.getUint8(5) * 65536;
    const distance = rawDistance / 10;

    // Drive pace: bytes 6-7 as uint16 little-endian
    // Raw value × 0.5 = seconds per 500m, then × 100 = centiseconds
    // So splitPace in centiseconds = rawPace × 50
    const rawSplit = dv.getUint8(6) + dv.getUint8(7) * 256;
    const splitPace = Math.round(rawSplit * 50);

    // Stroke rate: byte 8 as uint8
    const strokeRate = dv.byteLength >= 9 ? dv.getUint8(8) : 0;

    // Heart rate: bytes 9-10 as uint16 little-endian, only valid 40–220
    const rawHr = dv.byteLength >= 11 ? (dv.getUint8(9) + dv.getUint8(10) * 256) : 0;
    const heartRate = (rawHr >= 40 && rawHr <= 220) ? rawHr : 0;

    // Workout state: preserve via byte 13 (PM5 spec puts state machine info later);
    // also retained at byte 9 in older firmware but conflicts with HR low byte.
    // Use latest possible byte to avoid clash.
    let workoutState: number | undefined;
    if (dv.byteLength >= 14) {
      workoutState = dv.getUint8(13);
    } else if (dv.byteLength >= 11 && heartRate === 0) {
      // No HR present: byte 9 is likely workoutState in legacy parsing
      workoutState = dv.getUint8(9);
    }

    // Range validation
    if (splitPace > 0) _validateAndLog('split', splitPace / 100, 60, 300);
    if (distance > 0 && distance < _lastDistance && !_distanceWarned) {
      console.warn(`[PM5 SUSPICIOUS distance] decreased ${_lastDistance} -> ${distance}`);
      _distanceWarned = true;
    }
    _lastDistance = Math.max(_lastDistance, distance);

    const parsed: Partial<PM5StreamData> = { elapsedTime, distance, splitPace, strokeRate, heartRate };
    if (workoutState !== undefined) parsed.workoutState = workoutState;
    _log('0031', dv, parsed);
    return parsed;
  } catch { return {}; }
}

// 0x0032 – Rowing Additional Status
// Per user spec:
//  0-2: Elapsed time (uint24 LE, 0.01s)
//  3-4: Split pace (uint16 LE, 0.5s/500m units)
//  5-6: Stroke power (uint16 LE, watts) — read DIRECTLY
//  7:   Stroke calories (uint8)
//  8-9: Average pace (uint16 LE, 0.5s/500m units)
export function parseAdditionalStatus1(dv: DataView): Partial<PM5StreamData> {
  if (dv.byteLength < 7) return {};
  try {
    // Split pace: bytes 3-4
    const rawSplit  = dv.getUint8(3) + dv.getUint8(4) * 256;
    const splitPace = Math.round(rawSplit * 50);

    // Stroke power watts: bytes 5-6 — direct read, NO computation from pace
    const power = dv.getUint8(5) + dv.getUint8(6) * 256;
    if (power > 2000) {
      const hex = Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))
        .map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.warn(`[PM5 SUSPICIOUS power] ${power}W — raw bytes: ${hex}`);
    }
    _validateAndLog('power', power, 50, 1500);

    // Stroke calories: byte 7
    const calories = dv.byteLength >= 8 ? dv.getUint8(7) : 0;

    // Average pace: bytes 8-9
    const averagePace = dv.byteLength >= 10
      ? Math.round((dv.getUint8(8) + dv.getUint8(9) * 256) * 50)
      : undefined;

    const parsed: Partial<PM5StreamData> = { splitPace, power, calories };
    if (averagePace !== undefined) parsed.averagePace = averagePace;
    _log('0032', dv, parsed);
    return parsed;
  } catch { return {}; }
}

// 0x0033 – Rowing Additional Status 2
// Per user spec:
//  0-2: Elapsed time (uint24 LE, 0.01s)
//  3-4: Drive length (uint16 LE, 0.01m = cm)
//  5-6: Drive time (uint16 LE, 0.01s = centiseconds)
//  7-8: Stroke recovery time (uint16 LE, 0.01s)
//  9-10: Stroke count (uint16 LE)
export function parseAdditionalStatus2(dv: DataView): Partial<PM5StreamData> {
  if (dv.byteLength < 5) return {};
  try {
    // Drive length: bytes 3-4 (centimetres)
    const driveLength = dv.byteLength >= 5
      ? (dv.getUint8(3) + dv.getUint8(4) * 256)
      : 0;

    // Drive time: bytes 5-6 (centiseconds)
    const driveTime = dv.byteLength >= 7
      ? (dv.getUint8(5) + dv.getUint8(6) * 256)
      : 0;

    // Stroke recovery time: bytes 7-8 (centiseconds)
    const recoveryTime = dv.byteLength >= 9
      ? (dv.getUint8(7) + dv.getUint8(8) * 256)
      : 0;

    // Stroke count: bytes 9-10
    const strokeCount = dv.byteLength >= 11
      ? (dv.getUint8(9) + dv.getUint8(10) * 256)
      : 0;

    const parsed = { driveLength, driveTime, recoveryTime, strokeCount, strokeDistance: strokeCount };
    _log('0033', dv, parsed);
    return parsed;
  } catch { return {}; }
}

// Force Curve characteristic (per user spec UUID ce060393)
// Each notification is an array of uint16 force values for one complete drive phase.
// Loop in steps of 2, read each pair as getUint16(i, true). Range: 0–800 N typical.
export function parseForceCurve(dv: DataView): number[] {
  if (dv.byteLength < 2) return [];
  const forces: number[] = [];
  for (let i = 0; i + 1 < dv.byteLength; i += 2) {
    forces.push(dv.getUint16(i, true));
  }
  _log('FC', dv, { count: forces.length, peak: forces.length ? Math.max(...forces) : 0 });
  return forces;
}

// Legacy 0x0035 force curve fallback — uint8 samples
export function parseForceCurveLegacy(dv: DataView): number[] {
  if (dv.byteLength === 0) return [];
  const forces: number[] = [];
  for (let i = 0; i < dv.byteLength; i++) {
    forces.push(dv.getUint8(i));
  }
  _log('FC-legacy', dv, { count: forces.length, peak: forces.length ? Math.max(...forces) : 0 });
  return forces;
}

export function parseHRMeasurement(dv: DataView): number | null {
  try {
    const isUint16 = dv.getUint8(0) & 0x1;
    return isUint16 ? dv.getUint16(1, true) : dv.getUint8(1);
  } catch { return null; }
}

// ── Single pure dispatch function ────────────────────────────────────────────
// Per user spec: "Create a single pure function parseCharacteristic(uuid, value) that returns a typed object"
// Zero side effects beyond debug logging — parses only.
export function parseCharacteristic(uuid: string, value: DataView): Partial<PM5StreamData> & { forceCurve?: number[] } {
  const u = uuid.toLowerCase();
  if (u === PM5_STATUS_CHAR) return parseGeneralStatus(value);
  if (u === PM5_ADD1_CHAR)   return parseAdditionalStatus1(value);
  if (u === PM5_ADD2_CHAR)   return parseAdditionalStatus2(value);
  if (u === PM5_FORCE_CURVE_CHAR)   return { forceCurve: parseForceCurve(value) };
  if (u === PM5_FORCE_CURVE_LEGACY) return { forceCurve: parseForceCurveLegacy(value) };
  return {};
}

/**
 * Normalize any value that comes from a BLE characteristic notification into
 * a DataView. On iOS, @capacitor-community/bluetooth-le delivers DataView.
 * On other plugin versions / platforms it may be a base64 string,
 * Uint8Array, or ArrayBuffer.
 */
export function toDataView(value: unknown): DataView {
  if (value instanceof DataView) return value;

  if (typeof value === 'string') {
    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new DataView(bytes.buffer);
    } catch { return new DataView(new ArrayBuffer(0)); }
  }

  if (value instanceof Uint8Array) {
    return new DataView(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return new DataView(value);
  }

  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (v['buffer'] instanceof ArrayBuffer) return new DataView(v['buffer'] as ArrayBuffer);
    if (v['bytes']) return toDataView(v['bytes']);
    if (v['data']) return toDataView(v['data']);
  }

  console.error('[BLE] Unknown characteristic value type:', typeof value, value);
  return new DataView(new ArrayBuffer(0));
}

// ── Platform / browser detection ─────────────────────────────────────────────

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isMobileWebBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function isWebBluetoothSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!(navigator as any).bluetooth &&
    typeof (navigator as any).bluetooth.requestDevice === 'function'
  );
}

// ── Web BLE state ────────────────────────────────────────────────────────────

const webDevices = new Map<string, any>();

// ── Native BLE state ─────────────────────────────────────────────────────────

// Module-level flag — guards re-initialization. Set only AFTER BleClient.initialize resolves.
let isInitialized = false;
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Initialize the native BLE stack. Idempotent — subsequent calls return the
 * cached result. On web returns 'ready' immediately. Never throws — returns
 * a typed status. Internally calls BleClient.initialize only when on native.
 */
export async function initBle(): Promise<BleInitStatus> {
  // Web mobile browsers cannot use BLE at all
  if (isMobileWebBrowser()) return 'error';
  // Desktop web: Web Bluetooth handles its own init (or is unsupported)
  if (!Capacitor.isNativePlatform()) return 'ready';
  // Already initialized — return cached
  if (isInitialized) return 'ready';

  try {
    await BleClient.initialize({ androidNeverForLocation: true });
    isInitialized = true;
    return 'ready';
  } catch (e: any) {
    const msg = (e?.message ?? '').toLowerCase();
    if (msg.includes('denied') || msg.includes('permission') || msg.includes('unauthorized')) {
      return 'permission_denied';
    }
    if (msg.includes('off') || msg.includes('disabled') || msg.includes('powered') || msg.includes('unavailable')) {
      return 'bluetooth_off';
    }
    return 'error';
  }
}

/**
 * Initialize and return a richer typed result. Never throws.
 */
export async function initBleSafe(): Promise<InitResult> {
  try {
    const status = await initBle();
    return { ok: status === 'ready', status };
  } catch (e: any) {
    return { ok: false, status: 'error', error: e?.message ?? 'unknown error' };
  }
}

// ── Scan / Discover ──────────────────────────────────────────────────────────

/**
 * On native: performs a scoped BLE scan for PM5 + HR devices.
 * On web: opens the browser's built-in device picker.
 */
export async function listDevices(durationMs = 5000): Promise<BleDevice[]> {
  if (!Capacitor.isNativePlatform()) {
    if (isMobileWebBrowser()) {
      throw new Error('MOBILE_WEB_BLE');
    }
    if (!isWebBluetoothSupported()) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Chrome or Edge to connect via Bluetooth.'
      );
    }

    const device = await (navigator as any).bluetooth.requestDevice({
      filters: [
        { services: [PM5_SERVICE] },
        { namePrefix: 'PM5' },
        { namePrefix: 'Concept2' },
        { services: [HR_SERVICE] },
      ],
      optionalServices: [PM5_ROWING_SERVICE],
    });

    webDevices.set(device.id, device);

    const name: string = device.name || 'Unknown Device';
    const nameLower = name.toLowerCase();
    const isPM5 = nameLower.includes('pm5') || nameLower.includes('concept2');

    return [{ deviceId: device.id, name, isPM5, isHR: !isPM5 }];
  }

  // Native path ────────────────────────────────────────────────────────────
  const status = await initBle();
  if (status !== 'ready') {
    if (status === 'permission_denied') throw new Error('PERMISSION_DENIED');
    if (status === 'bluetooth_off') throw new Error('BLUETOOTH_OFF');
    throw new Error('BLE_UNAVAILABLE');
  }
  const map = new Map<string, BleDevice>();

  if (!Capacitor.isNativePlatform()) return [];

  // Filter scan by PM5 service UUID (per user spec — no unfiltered scans)
  await BleClient.requestLEScan(
    { services: [PM5_SERVICE, HR_SERVICE], allowDuplicates: false },
    (result: ScanResult) => {
      const id = result.device.deviceId;
      if (!map.has(id)) {
        const name = result.device.name || result.localName || 'Unknown Device';
        const serviceUuids = result.uuids || [];
        map.set(id, {
          deviceId: id,
          name,
          rssi: result.rssi ?? undefined,
          isPM5: name.includes('PM5') || name.includes('Concept2') || serviceUuids.includes(PM5_SERVICE),
          isHR: serviceUuids.includes(HR_SERVICE),
        });
      }
    }
  );

  await new Promise<void>(resolve => setTimeout(resolve, durationMs));
  if (Capacitor.isNativePlatform()) {
    try { await BleClient.stopLEScan(); } catch {}
  }

  return Array.from(map.values()).sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100));
}

// ── Connect ──────────────────────────────────────────────────────────────────

export async function connectToDevice(
  deviceId: string,
  onDisconnect?: DisconnectCallback
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const device = webDevices.get(deviceId);
    if (!device?.gatt) throw new Error('Device not found — please scan again.');

    const handleDisconnect = () => {
      onDisconnect?.();
      const timer = setTimeout(async () => {
        try { await device.gatt.connect(); } catch {}
      }, 2000);
      reconnectTimers.set(deviceId, timer);
    };

    device.addEventListener('gattserverdisconnected', handleDisconnect, { once: false });
    await device.gatt.connect();
    return;
  }

  // Native
  const status = await initBle();
  if (status !== 'ready') throw new Error(status === 'bluetooth_off' ? 'BLUETOOTH_OFF' : 'PERMISSION_DENIED');
  if (!Capacitor.isNativePlatform()) return;

  const disconnectHandler = () => {
    onDisconnect?.();
    const timer = setTimeout(async () => {
      if (!Capacitor.isNativePlatform()) return;
      try { await BleClient.connect(deviceId, disconnectHandler); } catch {}
    }, 2000);
    reconnectTimers.set(deviceId, timer);
  };
  await BleClient.connect(deviceId, disconnectHandler);
}

// ── Stream ───────────────────────────────────────────────────────────────────

export async function startStreaming(
  deviceId: string,
  callback: StreamCallback
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const device = webDevices.get(deviceId);
    if (!device?.gatt?.connected) throw new Error('Device not connected.');
    const server = device.gatt;

    const tryNotifyWeb = async (
      serviceUUID: string,
      charUUID: string,
      parser: (dv: DataView) => Partial<PM5StreamData>
    ) => {
      try {
        const svc  = await server.getPrimaryService(serviceUUID);
        const char = await svc.getCharacteristic(charUUID);
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (e: Event) => {
          const dv = (e.target as any).value as DataView;
          callback(parser(dv));
        });
      } catch {}
    };

    await tryNotifyWeb(PM5_ROWING_SERVICE, PM5_STATUS_CHAR, parseGeneralStatus);
    await tryNotifyWeb(PM5_ROWING_SERVICE, PM5_ADD1_CHAR,   parseAdditionalStatus1);
    await tryNotifyWeb(PM5_ROWING_SERVICE, PM5_ADD2_CHAR,   parseAdditionalStatus2);

    try {
      const hrSvc  = await server.getPrimaryService(HR_SERVICE);
      const hrChar = await hrSvc.getCharacteristic(HR_MEASUREMENT);
      await hrChar.startNotifications();
      hrChar.addEventListener('characteristicvaluechanged', (e: Event) => {
        const dv = (e.target as any).value as DataView;
        const hr = parseHRMeasurement(dv);
        if (hr !== null) callback({ heartRate: hr });
      });
    } catch {}

    return;
  }

  // Native — normalize value to DataView regardless of plugin format
  if (!Capacitor.isNativePlatform()) return;
  const tryNotify = async (service: string, char: string, parser: (dv: DataView) => Partial<PM5StreamData>) => {
    try {
      if (!Capacitor.isNativePlatform()) return;
      await BleClient.startNotifications(deviceId, service, char, (value) => {
        const dv = toDataView(value);
        callback(parser(dv));
      });
    } catch {}
  };

  await tryNotify(PM5_ROWING_SERVICE, PM5_STATUS_CHAR, parseGeneralStatus);
  await tryNotify(PM5_ROWING_SERVICE, PM5_ADD1_CHAR,   parseAdditionalStatus1);
  await tryNotify(PM5_ROWING_SERVICE, PM5_ADD2_CHAR,   parseAdditionalStatus2);

  try {
    if (!Capacitor.isNativePlatform()) return;
    await BleClient.startNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
      const dv = toDataView(value);
      const hr = parseHRMeasurement(dv);
      if (hr !== null) callback({ heartRate: hr });
    });
  } catch {}
}

/**
 * Subscribe to a single characteristic. Used for standalone HR monitors.
 */
export async function startNotification(
  deviceId: string,
  serviceUUID: string,
  charUUID: string,
  callback: (value: DataView) => void
): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const device = webDevices.get(deviceId);
    if (!device?.gatt?.connected) throw new Error('Device not connected.');
    const svc  = await device.gatt.getPrimaryService(serviceUUID);
    const char = await svc.getCharacteristic(charUUID);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', (e: Event) => {
      callback((e.target as any).value as DataView);
    });
    return;
  }
  if (!Capacitor.isNativePlatform()) return;
  await BleClient.startNotifications(deviceId, serviceUUID, charUUID, (value) => {
    callback(toDataView(value));
  });
}

// ── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectDevice(deviceId: string): Promise<void> {
  const timer = reconnectTimers.get(deviceId);
  if (timer) { clearTimeout(timer); reconnectTimers.delete(deviceId); }

  if (!Capacitor.isNativePlatform()) {
    const device = webDevices.get(deviceId);
    try { device?.gatt?.disconnect(); } catch {}
    webDevices.delete(deviceId);
    return;
  }

  if (!Capacitor.isNativePlatform()) return;
  try { await BleClient.disconnect(deviceId); } catch {}
}

// ── Permissions ──────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<BleInitStatus> {
  if (!Capacitor.isNativePlatform()) return isWebBluetoothSupported() ? 'ready' : 'error';
  return initBle();
}
