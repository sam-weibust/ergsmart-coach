import { Capacitor } from '@capacitor/core';
import { BleClient, ScanResult, numberToUUID } from '@capacitor-community/bluetooth-le';

// ── PM5 GATT UUIDs ──────────────────────────────────────────────────────────
export const PM5_SERVICE        = 'ce060000-43e5-11e4-916c-0800200c9a66';
export const PM5_ROWING_SERVICE = 'ce060030-43e5-11e4-916c-0800200c9a66';
export const PM5_STATUS_CHAR    = 'ce060031-43e5-11e4-916c-0800200c9a66'; // General Status
export const PM5_ADD1_CHAR      = 'ce060032-43e5-11e4-916c-0800200c9a66'; // Additional Status 1
export const PM5_ADD2_CHAR      = 'ce060033-43e5-11e4-916c-0800200c9a66'; // Additional Status 2 (drive/recovery)

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
  // General Status
  elapsedTime: number | null;     // centiseconds
  distance: number | null;        // metres (1 decimal)
  workoutState: number | null;    // 0=idle 1=countdown 2=rowing 3=paused 4=finished
  strokeRate: number | null;      // spm
  heartRate: number | null;       // bpm
  calories: number | null;        // total kcal
  // Additional Status 1
  splitPace: number | null;       // centiseconds/500m
  power: number | null;           // watts
  // Additional Status 2
  driveLength: number | null;     // cm/10
  driveTime: number | null;       // ms
  recoveryTime: number | null;    // ms
  strokeDistance: number | null;  // cm
}

export type StreamCallback = (data: Partial<PM5StreamData>) => void;
export type DisconnectCallback = () => void;

// ── Parser helpers ───────────────────────────────────────────────────────────

export function parseGeneralStatus(dv: DataView): Partial<PM5StreamData> {
  if (dv.byteLength < 14) return {};
  try {
    return {
      elapsedTime:  dv.getUint8(0) | (dv.getUint8(1) << 8) | (dv.getUint8(2) << 16),
      distance:     ((dv.getUint8(3) | (dv.getUint8(4) << 8) | (dv.getUint8(5) << 16)) / 10),
      workoutState: dv.getUint8(8),
      strokeRate:   dv.getUint8(9),
      heartRate:    dv.getUint8(10),
      calories:     dv.getUint16(13, true),
    };
  } catch { return {}; }
}

export function parseAdditionalStatus1(dv: DataView): Partial<PM5StreamData> {
  if (dv.byteLength < 5) return {};
  try {
    return {
      splitPace: dv.getUint16(0, true),
      power:     dv.getUint16(3, true),
    };
  } catch { return {}; }
}

export function parseAdditionalStatus2(dv: DataView): Partial<PM5StreamData> {
  if (dv.byteLength < 6) return {};
  try {
    return {
      driveLength:    dv.getUint8(0),
      driveTime:      dv.getUint8(1) * 10,  // ms
      recoveryTime:   dv.getUint16(2, true),
      strokeDistance: dv.getUint16(4, true),
    };
  } catch { return {}; }
}

export function parseHRMeasurement(dv: DataView): number | null {
  try {
    const isUint16 = dv.getUint8(0) & 0x1;
    return isUint16 ? dv.getUint16(1, true) : dv.getUint8(1);
  } catch { return null; }
}

// ── BLE Client ───────────────────────────────────────────────────────────────

let initialized = false;
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function initBle(): Promise<void> {
  if (initialized) return;
  await BleClient.initialize({ androidNeverForLocation: true });
  initialized = true;
}

/**
 * Scan for BLE devices for `durationMs` ms and return unique found devices.
 * Looks for PM5 and HR monitors by default.
 */
export async function listDevices(durationMs = 5000): Promise<BleDevice[]> {
  await initBle();
  const map = new Map<string, BleDevice>();

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
  try { await BleClient.stopLEScan(); } catch {}

  return Array.from(map.values()).sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100));
}

/**
 * Connect to a device and set up auto-reconnect on disconnect.
 */
export async function connectToDevice(
  deviceId: string,
  onDisconnect?: DisconnectCallback
): Promise<void> {
  await initBle();

  const disconnectHandler = () => {
    onDisconnect?.();
    // Auto-reconnect after 2 s
    const timer = setTimeout(async () => {
      try {
        await BleClient.connect(deviceId, disconnectHandler);
      } catch {
        // Reconnect failed — caller should handle via onDisconnect
      }
    }, 2000);
    reconnectTimers.set(deviceId, timer);
  };

  await BleClient.connect(deviceId, disconnectHandler);
}

/**
 * Subscribe to all PM5 rowing characteristics and invoke callback on each update.
 * Also subscribes to HR measurement if the device exposes it.
 */
export async function startStreaming(
  deviceId: string,
  callback: StreamCallback
): Promise<void> {
  const tryNotify = async (service: string, char: string, parser: (dv: DataView) => Partial<PM5StreamData>) => {
    try {
      await BleClient.startNotifications(deviceId, service, char, (value) => {
        callback(parser(value));
      });
    } catch {}
  };

  await tryNotify(PM5_ROWING_SERVICE, PM5_STATUS_CHAR, parseGeneralStatus);
  await tryNotify(PM5_ROWING_SERVICE, PM5_ADD1_CHAR,   parseAdditionalStatus1);
  await tryNotify(PM5_ROWING_SERVICE, PM5_ADD2_CHAR,   parseAdditionalStatus2);

  // Heart rate (standalone HR monitor or PM5 HR passthrough)
  try {
    await BleClient.startNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
      const hr = parseHRMeasurement(value);
      if (hr !== null) callback({ heartRate: hr });
    });
  } catch {}
}

/**
 * Stop streaming and disconnect from a device.
 */
export async function disconnectDevice(deviceId: string): Promise<void> {
  const timer = reconnectTimers.get(deviceId);
  if (timer) { clearTimeout(timer); reconnectTimers.delete(deviceId); }
  try { await BleClient.disconnect(deviceId); } catch {}
}

export async function requestPermissions(): Promise<boolean> {
  try {
    if (!isNativePlatform()) return true;
    const result = await BleClient.requestLEScan({ services: [] }, () => {});
    await BleClient.stopLEScan();
    return true;
  } catch {
    return false;
  }
}
