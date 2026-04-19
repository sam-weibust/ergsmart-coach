import { Capacitor } from '@capacitor/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';

// ── PM5 GATT UUIDs ──────────────────────────────────────────────────────────
export const PM5_SERVICE        = 'ce060000-43e5-11e4-916c-0800200c9a66';
export const PM5_ROWING_SERVICE = 'ce060030-43e5-11e4-916c-0800200c9a66';
export const PM5_STATUS_CHAR    = 'ce060031-43e5-11e4-916c-0800200c9a66';
export const PM5_ADD1_CHAR      = 'ce060032-43e5-11e4-916c-0800200c9a66';
export const PM5_ADD2_CHAR      = 'ce060033-43e5-11e4-916c-0800200c9a66';

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

export function parseHRMeasurement(dv: DataView): number | null {
  try {
    const isUint16 = dv.getUint8(0) & 0x1;
    return isUint16 ? dv.getUint16(1, true) : dv.getUint8(1);
  } catch { return null; }
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

export async function initBle(): Promise<void> {
  if (!isNativePlatform()) return; // Web Bluetooth needs no init
  if (initialized) return;
  await BleClient.initialize({ androidNeverForLocation: true });
  initialized = true;
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
  await initBle();
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

  // Native
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

  try {
    await BleClient.startNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
      const hr = parseHRMeasurement(value);
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
  await BleClient.startNotifications(deviceId, serviceUUID, charUUID, callback);
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

export async function requestPermissions(): Promise<boolean> {
  if (!isNativePlatform()) return isWebBluetoothSupported();
  try {
    await initBle();
    await BleClient.requestLEScan({ services: [] }, () => {});
    await BleClient.stopLEScan();
    return true;
  } catch {
    return false;
  }
}
