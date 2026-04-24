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

const PM5_SERVICE       = 'ce060030-43e5-11e4-916c-0800200c9a66';
const PM5_STATUS_CHAR   = 'ce060031-43e5-11e4-916c-0800200c9a66'; // General status
const PM5_ADD1_CHAR     = 'ce060032-43e5-11e4-916c-0800200c9a66'; // Additional status 1
const PM5_ADD2_CHAR     = 'ce060033-43e5-11e4-916c-0800200c9a66'; // Additional status 2

// ─── Data Parsing ──────────────────────────────────────────────────────────────

function parseGeneralStatus(data: Uint8Array): Partial<ErgMetrics> {
  if (data.length < 19) return {};
  const view = new DataView(data.buffer);

  // Elapsed time: bytes 0-2 (little-endian, 0.01s resolution)
  const elapsedRaw = view.getUint8(0) | (view.getUint8(1) << 8) | (view.getUint8(2) << 16);
  const elapsed_seconds = Math.round(elapsedRaw / 100);

  // Distance: bytes 3-5 (0.1m resolution)
  const distRaw = view.getUint8(3) | (view.getUint8(4) << 8) | (view.getUint8(5) << 16);
  const distance_meters = Math.round(distRaw / 10);

  // Pace: bytes 6-7 (0.01s/500m resolution)
  const paceRaw = view.getUint16(6, true);
  const split_seconds = paceRaw / 100;

  // Stroke rate: byte 9
  const stroke_rate = view.getUint8(9);

  // Heart rate: byte 8
  const heart_rate = view.getUint8(8) || null;

  // Calories: bytes 10-11
  const calories = view.getUint16(10, true);

  return {
    elapsed_seconds,
    distance_meters,
    split_seconds: split_seconds > 0 && split_seconds < 600 ? split_seconds : null,
    stroke_rate: stroke_rate > 0 ? stroke_rate : null,
    heart_rate,
    calories,
  };
}

function parseAdditionalStatus1(data: Uint8Array): Partial<ErgMetrics> {
  if (data.length < 11) return {};
  const view = new DataView(data.buffer);

  // Watts: bytes 3-4
  const watts = view.getUint16(3, true);

  return {
    watts: watts > 0 ? watts : null,
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
    const splitBase = 125; // ~2:05 base

    const interval = setInterval(() => {
      elapsed += 1;
      distance += 500 / (splitBase + Math.sin(elapsed * 0.1) * 5);
      const split = splitBase + Math.sin(elapsed * 0.1) * 5;
      const rate = 22 + Math.round(Math.sin(elapsed * 0.08) * 2);
      const watts = Math.round(2.8 * Math.pow(500 / split, 3));

      setMetrics({
        split_seconds: split,
        stroke_rate: rate,
        distance_meters: Math.round(distance),
        calories: Math.round(elapsed * 0.18),
        elapsed_seconds: elapsed,
        watts,
        heart_rate: 148 + Math.round(Math.sin(elapsed * 0.05) * 5),
        pace_category: 'moderate',
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

  // Lazy-import so the module isn't required in Expo Go / web
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
  }, []);

  const scan = useCallback(async () => {
    const manager = getManager();

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
                  setMetrics((prev) => ({ ...prev, ...parseGeneralStatus(bytes) }));
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
          })
          .catch((err) => {
            setConnectionState('disconnected');
            Alert.alert('Connection Failed', err?.message ?? 'Could not connect to PM5.');
          });
      },
    );
  }, [getManager]);

  // Cleanup on unmount
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

  // Hooks must be called unconditionally, so we call both and pick one.
  const simulated = useSimulatedErgBle();
  const native = useNativeErgBle();

  // On native platforms, attempt real BLE; fall back to simulation if the
  // module is missing (e.g. running in Expo Go without a dev client).
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
