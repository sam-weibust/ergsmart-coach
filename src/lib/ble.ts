import { Capacitor } from '@capacitor/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';

// ── PM5 GATT UUIDs ──────────────────────────────────────────────────────────
export const PM5_SERVICE        = 'ce060000-43e5-11e4-916c-0800200c9a66';
export const PM5_ROWING_SERVICE = 'ce060030-43e5-11e4-916c-0800200c9a66';
export const PM5_STATUS_CHAR    = 'ce060031-43e5-11e4-916c-0800200c9a66';
export const PM5_ADD1_CHAR      = 'ce060032-43e5-11e4-916c-0800200c9a66';
export const PM5_ADD2_CHAR       = 'ce060033-43e5-11e4-916c-0800200c9a66';
export const PM5_STROKE_CHAR    = 'ce060034-43e5-11e4-916c-0800200c9a66';
export const PM5_FORCE_CURVE_CHAR = 'ce060037-43e5-11e4-916c-0800200c9a66';

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
  elapsedTime: number | null;
  distance: number | null;
  workoutState: number | null;
  strokeRate: number | null;
  heartRate: number | null;
  calories: number | null;
  splitPace: number | null;
  power: number | null;
  driveLength: number | null;
  driveTime: number | null;
  recoveryTime: number | null;
  strokeDistance: number | null;
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
    const rawSplit = dv.getUint16(0, true);
    const rawPower = dv.byteLength >= 6 ? dv.getUint16(4, true) : 0;
    console.log('[PM5 raw] splitPace (centiseconds/500m):', rawSplit, '| power (watts):', rawPower, '| byteLength:', dv.byteLength);
    return {
      splitPace: rawSplit,
      power:     rawPower,
    };
  } catch { return {}; }
}

export function parseAdditionalStatus2(dv: DataView): Partial<PM5StreamData> {
  if (dv.byteLength < 6) return {};
  try {
    return {
      driveLength:    dv.getUint8(0),
      driveTime:      dv.getUint8(1) * 10,
      recoveryTime:   dv.getUint16(2, true),
      strokeDistance: dv.getUint16(4, true),
    };
  } catch { return {}; }
}

export function parseForceCurve(dv: DataView): number[] {
  if (dv.byteLength < 2) return [];
  const count = Math.min(dv.getUint8(0), 32);
  const forces: number[] = [];
  for (let i = 0; i < count && 1 + i * 2 + 1 < dv.byteLength; i++) {
    forces.push(dv.getUint16(1 + i * 2, true) / 10); // 0.1 N → N
  }
  return forces;
}

export function parseHRMeasurement(dv: DataView): number | null {
  try {
    const isUint16 = dv.getUint8(0) & 0x1;
    return isUint16 ? dv.getUint16(1, true) : dv.getUint8(1);
  } catch { return null; }
}

/**
 * Normalize any value that comes from a BLE characteristic notification into
 * a DataView. On iOS, @capacitor-community/bluetooth-le may deliver the value
 * as a DataView, a base64 string, a Uint8Array, or an ArrayBuffer depending on
 * the plugin version and iOS build. This handles all formats gracefully.
 */
export function toDataView(value: unknown): DataView {
  if (value instanceof DataView) return value;

  if (typeof value === 'string') {
    // Base64-encoded bytes from some Capacitor plugin versions
    console.log('[BLE] Received base64 string, first 20 chars:', value.slice(0, 20));
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

  // Capacitor plugin object wrapping — check common property names
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

/**
 * Returns true if the standard Web Bluetooth requestDevice API is available.
 * Chrome and Edge on desktop/Android support this. Safari and Firefox do not.
 */
export function isWebBluetoothSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!(navigator as any).bluetooth &&
    typeof (navigator as any).bluetooth.requestDevice === 'function'
  );
}

// ── Web BLE state ────────────────────────────────────────────────────────────

// Stores BluetoothDevice objects keyed by device.id so we can reconnect/disconnect
const webDevices = new Map<string, any>();

// ── Native BLE state ─────────────────────────────────────────────────────────

let initialized = false;
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type BleInitStatus = 'ready' | 'permission_denied' | 'bluetooth_off' | 'error';

export async function initBle(): Promise<BleInitStatus> {
  if (!isNativePlatform()) return 'ready'; // Web Bluetooth needs no init
  if (initialized) return 'ready';
  try {
    await BleClient.initialize({ androidNeverForLocation: true });
    initialized = true;
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

// ── Scan / Discover ──────────────────────────────────────────────────────────

/**
 * On native: performs a background BLE scan for `durationMs` and returns all
 * found PM5 / HR devices.
 *
 * On web: opens the browser's built-in device picker (requestDevice) — the
 * `durationMs` parameter is ignored. Returns a single-item array with the
 * device the user selects, or throws if the user cancels.
 */
export async function listDevices(durationMs = 5000): Promise<BleDevice[]> {
  if (!isNativePlatform()) {
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

// ── Connect ──────────────────────────────────────────────────────────────────

export async function connectToDevice(
  deviceId: string,
  onDisconnect?: DisconnectCallback
): Promise<void> {
  if (!isNativePlatform()) {
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
  const disconnectHandler = () => {
    onDisconnect?.();
    const timer = setTimeout(async () => {
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
  if (!isNativePlatform()) {
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

  // Native — normalize value to DataView regardless of what the plugin delivers
  const tryNotify = async (service: string, char: string, parser: (dv: DataView) => Partial<PM5StreamData>) => {
    try {
      await BleClient.startNotifications(deviceId, service, char, (value) => {
        const dv = toDataView(value);
        console.log(`[BLE native] char ${char.slice(-4)} type=${typeof value} bytes=${dv.byteLength} [0]=${dv.byteLength > 0 ? dv.getUint8(0) : 'n/a'}`);
        callback(parser(dv));
      });
    } catch {}
  };

  await tryNotify(PM5_ROWING_SERVICE, PM5_STATUS_CHAR, parseGeneralStatus);
  await tryNotify(PM5_ROWING_SERVICE, PM5_ADD1_CHAR,   parseAdditionalStatus1);
  await tryNotify(PM5_ROWING_SERVICE, PM5_ADD2_CHAR,   parseAdditionalStatus2);

  try {
    await BleClient.startNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
      const dv = toDataView(value);
      const hr = parseHRMeasurement(dv);
      if (hr !== null) callback({ heartRate: hr });
    });
  } catch {}
}

/**
 * Subscribe to a single characteristic. Used for standalone HR monitors in DeviceSection.
 */
export async function startNotification(
  deviceId: string,
  serviceUUID: string,
  charUUID: string,
  callback: (value: DataView) => void
): Promise<void> {
  if (!isNativePlatform()) {
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
  await BleClient.startNotifications(deviceId, serviceUUID, charUUID, (value) => {
    callback(toDataView(value));
  });
}

// ── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectDevice(deviceId: string): Promise<void> {
  const timer = reconnectTimers.get(deviceId);
  if (timer) { clearTimeout(timer); reconnectTimers.delete(deviceId); }

  if (!isNativePlatform()) {
    const device = webDevices.get(deviceId);
    try { device?.gatt?.disconnect(); } catch {}
    webDevices.delete(deviceId);
    return;
  }

  try { await BleClient.disconnect(deviceId); } catch {}
}

// ── Permissions ──────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<BleInitStatus> {
  if (!isNativePlatform()) return isWebBluetoothSupported() ? 'ready' : 'error';
  return initBle();
}
