/**
 * useErgBle — React Native BLE hook for Concept2 PM5
 *
 * Uses react-native-ble-plx to scan, connect, and stream live metrics
 * from the PM5 over GATT. Falls back to simulation mode in Expo Go /
 * web where BLE APIs are unavailable.
 *
 * PM5 GATT protocol reference:
 *   https://www.concept2.com/service/software/software-development-kit
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { ErgMetrics } from '../types';

// ─── PM5 GATT UUIDs ────────────────────────────────────────────────────────────

const PM5_SERVICE     = 'ce060030-43e5-11e4-916c-0800200c9a66';
const PM5_STATUS_CHAR = 'ce060031-43e5-11e4-916c-0800200c9a66'; // General status
const PM5_ADD1_CHAR   = 'ce060032-43e5-11e4-916c-0800200c9a66'; // Additional status 1
const PM5_ADD2_CHAR   = 'ce060033-43e5-11e4-916c-0800200c9a66'; // Additional status 2

// ─── Debug logging (first 10 strokes only) ─────────────────────────────────────

let debugStrokeCount = 0;

function debugLog(charName: string, data: Uint8Array) {
  if (debugStrokeCount >= 10) return;
  debugStrokeCount++;
  const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`[PM5 BLE] ${charName} raw bytes: ${hex}`);
}

// ─── Data Parsing ──────────────────────────────────────────────────────────────

/**
 * General Status (0x0031)
 * Byte 0-2:  elapsed time  — uint24 LE, 0.01s units
 * Byte 3-5:  distance      — uint24 LE, 0.1m units
 * Byte 6-7:  split pace    — uint16 LE, 0.5s/500m units
 * Byte 8:    stroke rate   — uint8, spm
 * Byte 9-10: heart rate    — uint16 LE, bpm (valid 40-220)
 */
function parseGeneralStatus(data: Uint8Array): Partial<ErgMetrics> {
  if (data.length < 11) return {};
  debugLog('GeneralStatus(0031)', data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const elapsedRaw = view.getUint8(0) + view.getUint8(1) * 256 + view.getUint8(2) * 65536;
  const elapsed_seconds = elapsedRaw / 100;

  const distRaw = view.getUint8(3) + view.getUint8(4) * 256 + view.getUint8(5) * 65536;
  const distance_meters = Math.round(distRaw / 10);

  const paceRaw = view.getUint8(6) + view.getUint8(7) * 256;
  const split_seconds = paceRaw * 0.5; // 0.5s/500m units

  const stroke_rate = view.getUint8(8);

  const hrRaw = view.getUint8(9) + view.getUint8(10) * 256;
  const heart_rate = hrRaw >= 40 && hrRaw <= 220 ? hrRaw : null;

  return {
    elapsed_seconds: Math.round(elapsed_seconds),
    distance_meters,
    split_seconds: split_seconds > 0 && split_seconds < 600 ? split_seconds : null,
    stroke_rate: stroke_rate > 0 ? stroke_rate : null,
    heart_rate,
  };
}

/**
 * Additional Status 1 (0x0032)
 * Byte 0-2: elapsed time  — uint24 LE, 0.01s units
 * Byte 3-4: split pace    — uint16 LE, 0.5s/500m units
 * Byte 5-6: stroke power  — uint16 LE, watts
 * Byte 7:   stroke calories
 * Byte 8-9: average pace  — uint16 LE
 */
function parseAdditionalStatus1(data: Uint8Array): Partial<ErgMetrics> {
  if (data.length < 7) return {};
  debugLog('AdditionalStatus1(0032)', data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const wattsRaw = view.getUint8(5) + view.getUint8(6) * 256;
  if (wattsRaw > 2000) {
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.warn(`[PM5 BLE] Unexpected watts value ${wattsRaw} — raw bytes: ${hex}`);
  }
  const watts = wattsRaw > 0 && wattsRaw <= 2000 ? wattsRaw : null;

  const calories = data.length > 7 ? view.getUint8(7) : undefined;

  return {
    watts,
    ...(calories !== undefined ? { calories } : {}),
  };
}

/**
 * Additional Status 2 (0x0033)
 * Byte 0-2:  elapsed time         — uint24 LE, 0.01s units
 * Byte 3-4:  drive length         — uint16 LE, 0.01m units
 * Byte 5-6:  drive time           — uint16 LE, 0.01s units
 * Byte 7-8:  stroke recovery time — uint16 LE, 0.01s units
 * Byte 9-10: stroke count         — uint16 LE
 */
function parseAdditionalStatus2(data: Uint8Array): Partial<ErgMetrics> {
  if (data.length < 11) return {};
  debugLog('AdditionalStatus2(0033)', data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const drive_length_m = (view.getUint8(3) + view.getUint8(4) * 256) / 100;
  const drive_time_s = (view.getUint8(5) + view.getUint8(6) * 256) / 100;
  const recovery_time_s = (view.getUint8(7) + view.getUint8(8) * 256) / 100;
  const stroke_count = view.getUint8(9) + view.getUint8(10) * 256;

  return {
    drive_length_m: drive_length_m > 0 ? drive_length_m : null,
    drive_time_s: drive_time_s > 0 ? drive_time_s : null,
    recovery_time_s: recovery_time_s > 0 ? recovery_time_s : null,
    stroke_count: stroke_count > 0 ? stroke_count : null,
  };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function computeProjectedFinish(metrics: ErgMetrics): number | null {
  if (!metrics.split_seconds || !metrics.stroke_count || metrics.stroke_count < 5) return null;
  return (metrics.split_seconds / 500) * 2000;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected';

export interface UseErgBleReturn {
  connectionState: ConnectionState;
  metrics: ErgMetrics;
  deviceName: string | null;
  scan: () => Promise<void>;
  disconnect: () => void;
}

const DEFAULT_METRICS: ErgMetrics = {
  split_seconds: null,
  stroke_rate: null,
  distance_meters: null,
  calories: null,
  elapsed_seconds: null,
  watts: null,
  heart_rate: null,
  pace_category: null,
  projected_finish_seconds: null,
  drive_length_m: null,
  drive_time_s: null,
  recovery_time_s: null,
  stroke_count: null,
};

// ─── Simulation (Expo Go / web fallback) ───────────────────────────────────────

function useSimulatedErgBle(): UseErgBleReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [metrics, setMetrics] = useState<ErgMetrics>(DEFAULT_METRICS);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setConnectionState('scanning');
    await new Promise((r) => setTimeout(r, 1800));

    Alert.alert(
      'Simulated PM5',
      'BLE is unavailable in Expo Go. Use a development build for real PM5 connectivity. Connecting to simulation...',
      [
        {
          text: 'Connect (Simulated)',
          onPress: () => {
            setConnectionState('connecting');
            setTimeout(() => {
              setConnectionState('connected');
              setDeviceName('PM5 (Simulation)');
            }, 800);
          },
        },
        { text: 'Cancel', onPress: () => setConnectionState('disconnected') },
      ],
    );
  }, []);

  const disconnect = useCallback(() => {
    setConnectionState('disconnected');
    setDeviceName(null);
    setMetrics(DEFAULT_METRICS);
  }, []);

  useEffect(() => {
    if (connectionState !== 'connected') return;

    let elapsed = 0;
    let distance = 0;
    let strokes = 0;
    const splitBase = 125; // ~2:05 base

    const interval = setInterval(() => {
      elapsed += 1;
      strokes += 1;
      distance += 500 / (splitBase + Math.sin(elapsed * 0.1) * 5);
      const split = splitBase + Math.sin(elapsed * 0.1) * 5;
      const rate = 22 + Math.round(Math.sin(elapsed * 0.08) * 2);
      const watts = Math.round(2.8 * Math.pow(500 / split, 3));
      const projected = strokes >= 5 ? (split / 500) * 2000 : null;

      setMetrics({
        split_seconds: split,
        stroke_rate: rate,
        distance_meters: Math.round(distance),
        calories: Math.round(elapsed * 0.18),
        elapsed_seconds: elapsed,
        watts,
        heart_rate: 148 + Math.round(Math.sin(elapsed * 0.05) * 5),
        pace_category: 'moderate',
        projected_finish_seconds: projected,
        drive_length_m: 1.35,
        drive_time_s: 0.58,
        recovery_time_s: 1.12,
        stroke_count: strokes,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionState]);

  return { connectionState, metrics, deviceName, scan, disconnect };
}

// ─── Real BLE (native only) ────────────────────────────────────────────────────

function useNativeErgBle(): UseErgBleReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [metrics, setMetrics] = useState<ErgMetrics>(DEFAULT_METRICS);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  const managerRef = useRef<import('react-native-ble-plx').BleManager | null>(null);
  const deviceRef = useRef<import('react-native-ble-plx').Device | null>(null);

  const getManager = useCallback(() => {
    if (!managerRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { BleManager } = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
      managerRef.current = new BleManager();
    }
    return managerRef.current;
  }, []);

  const disconnect = useCallback(() => {
    deviceRef.current?.cancelConnection().catch(() => {});
    deviceRef.current = null;
    managerRef.current?.stopDeviceScan();
    setConnectionState('disconnected');
    setDeviceName(null);
    setMetrics(DEFAULT_METRICS);
    debugStrokeCount = 0;
  }, []);

  const scan = useCallback(async () => {
    const manager = getManager();
    debugStrokeCount = 0;
    setConnectionState('scanning');

    manager.startDeviceScan(
      [PM5_SERVICE],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          setConnectionState('disconnected');
          Alert.alert('Bluetooth Error', error.message);
          return;
        }

        if (!device) return;

        const name = device.name ?? device.localName ?? '';
        if (!name.toLowerCase().includes('pm5') && !name.toLowerCase().includes('concept2')) {
          return;
        }

        manager.stopDeviceScan();
        setConnectionState('connecting');

        device
          .connect({ timeout: 10000 })
          .then((d) => d.discoverAllServicesAndCharacteristics())
          .then((d) => {
            deviceRef.current = d;
            setDeviceName(d.name ?? 'Concept2 PM5');
            setConnectionState('connected');

            d.monitorCharacteristicForService(
              PM5_SERVICE,
              PM5_STATUS_CHAR,
              (_err, char) => {
                if (char?.value) {
                  const bytes = base64ToUint8Array(char.value);
                  setMetrics((prev) => {
                    const next = { ...prev, ...parseGeneralStatus(bytes) };
                    next.projected_finish_seconds = computeProjectedFinish(next);
                    return next;
                  });
                }
              },
            );

            d.monitorCharacteristicForService(
              PM5_SERVICE,
              PM5_ADD1_CHAR,
              (_err, char) => {
                if (char?.value) {
                  const bytes = base64ToUint8Array(char.value);
                  setMetrics((prev) => ({ ...prev, ...parseAdditionalStatus1(bytes) }));
                }
              },
            );

            d.monitorCharacteristicForService(
              PM5_SERVICE,
              PM5_ADD2_CHAR,
              (_err, char) => {
                if (char?.value) {
                  const bytes = base64ToUint8Array(char.value);
                  setMetrics((prev) => {
                    const next = { ...prev, ...parseAdditionalStatus2(bytes) };
                    next.projected_finish_seconds = computeProjectedFinish(next);
                    return next;
                  });
                }
              },
            );
          })
          .catch((err) => {
            setConnectionState('disconnected');
            Alert.alert('Connection Failed', err?.message ?? 'Could not connect to PM5.');
          });
      },
    );
  }, [getManager]);

  useEffect(() => {
    return () => {
      deviceRef.current?.cancelConnection().catch(() => {});
      managerRef.current?.stopDeviceScan();
      managerRef.current?.destroy();
    };
  }, []);

  return { connectionState, metrics, deviceName, scan, disconnect };
}

// ─── Public hook — auto-selects real vs. simulation ─────────────────────────

export function useErgBle(): UseErgBleReturn {
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  const simulated = useSimulatedErgBle();
  const native = useNativeErgBle();

  if (isNative) {
    try {
      require('react-native-ble-plx');
      return native;
    } catch {
      return simulated;
    }
  }

  return simulated;
}
