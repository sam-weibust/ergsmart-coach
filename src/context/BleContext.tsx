import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { initBle, isNativePlatform } from '@/lib/ble';

const PM5_SERVICE        = 'ce060000-43e5-11e4-916c-0800200c9a66';
const PM5_ROWING_SERVICE = 'ce060030-43e5-11e4-916c-0800200c9a66';

// Connection timeout (10 seconds per user spec)
const CONNECT_TIMEOUT_MS = 10000;

interface BleContextValue {
  /** deviceId string on native, BluetoothDevice.id on web */
  ergDeviceId: string | null;
  ergDeviceName: string | null;
  ergConnected: boolean;
  ergConnecting: boolean;
  /** On web: the BluetoothDevice object so views can access gatt. Null on native. */
  webErgDevice: any | null;
  connectPM5: () => Promise<void>;
  disconnectPM5: () => void;
}

const BleContext = createContext<BleContextValue>({
  ergDeviceId: null,
  ergDeviceName: null,
  ergConnected: false,
  ergConnecting: false,
  webErgDevice: null,
  connectPM5: async () => {},
  disconnectPM5: () => {},
});

const isNative = Capacitor.isNativePlatform();

function BleProviderNative({ children }: { children: React.ReactNode }) {
  const [ergDeviceId, setErgDeviceId]     = useState<string | null>(null);
  const [ergDeviceName, setErgDeviceName] = useState<string | null>(null);
  const [ergConnected, setErgConnected]   = useState(false);
  const [ergConnecting, setErgConnecting] = useState(false);
  const [webErgDevice, setWebErgDevice]   = useState<any | null>(null);

  // Keep a stable ref to deviceId + name for callbacks / reconnect restore
  const ergDeviceIdRef = useRef<string | null>(null);
  const ergDeviceNameRef = useRef<string | null>(null);

  const connectPM5 = useCallback(async () => {
    setErgConnecting(true);
    try {
      if (Capacitor.isNativePlatform()) {
        await initBle();

        // Per user spec: filter scan by PM5 service UUID — no unfiltered scans
        const device = await BleClient.requestDevice({
          services: [PM5_SERVICE],
          optionalServices: [PM5_ROWING_SERVICE],
        });
        const id = device.deviceId;
        ergDeviceIdRef.current = id;

        const handleDisconnect = () => {
          // Fix 4: reset ALL exposed state on any disconnect — user-initiated OR
          // device-dropped. Refs are kept so best-effort auto-reconnect can restore.
          setErgConnected(false);
          setErgDeviceId(null);
          setErgDeviceName(null);
          // Auto-reconnect (best-effort)
          setTimeout(async () => {
            const currentId = ergDeviceIdRef.current;
            if (!currentId) return;
            if (!Capacitor.isNativePlatform()) return;
            try {
              await BleClient.connect(currentId, handleDisconnect);
              // Restore identity on successful reconnect
              setErgDeviceId(currentId);
              setErgDeviceName(ergDeviceNameRef.current || 'Concept2 PM5');
              setErgConnected(true);
            } catch {}
          }, 2000);
        };

        // Wrap connect in a 10-second timeout race
        const connectPromise = BleClient.connect(id, handleDisconnect);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('CONNECT_TIMEOUT')), CONNECT_TIMEOUT_MS)
        );
        try {
          await Promise.race([connectPromise, timeoutPromise]);
        } catch (e: any) {
          if (e?.message === 'CONNECT_TIMEOUT') {
            console.error('[BleContext] PM5 connect timed out after 10s');
            // Ensure state is cleared on timeout
            setErgConnected(false);
            ergDeviceIdRef.current = null;
            // Best-effort cleanup
            try {
              if (Capacitor.isNativePlatform()) await BleClient.disconnect(id);
            } catch {}
            throw new Error('Connection timed out. Make sure your PM5 is on and nearby, then try again.');
          }
          throw e;
        }
        setErgDeviceId(id);
        ergDeviceNameRef.current = device.name || 'Concept2 PM5';
        setErgDeviceName(device.name || 'Concept2 PM5');
        setErgConnected(true);

        // Log all discovered services + characteristics — critical for verifying
        // the force-curve characteristic UUID on real PM5 hardware.
        try {
          const services = await BleClient.getServices(id);
          for (const svc of services) {
            console.log('[PM5 discovered service]', svc.uuid);
            for (const ch of svc.characteristics ?? []) {
              console.log('[PM5 discovered char]', svc.uuid, '→', ch.uuid);
            }
          }
        } catch (e) {
          console.warn('[PM5] getServices discovery failed:', e);
        }
      } else {
        // Web Bluetooth — safe disabled state on mobile web, otherwise picker
        if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
          console.error('[BleContext] Web Bluetooth not available');
          return;
        }
        // Per user spec: filter by PM5 service UUID
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [
            { services: [PM5_SERVICE] },
            { namePrefix: 'PM5' },
            { namePrefix: 'Concept2' },
          ],
          optionalServices: [PM5_ROWING_SERVICE],
        });

        const handleWebDisconnect = async () => {
          // Fix 4: reset ALL exposed state on any disconnect (user or device-dropped).
          setErgConnected(false);
          setErgDeviceId(null);
          setErgDeviceName(null);
          setTimeout(async () => {
            try {
              await device.gatt.connect();
              setErgDeviceId(device.id);
              setErgDeviceName(device.name || 'Concept2 PM5');
              setErgConnected(true);
            } catch {}
          }, 2000);
        };

        device.addEventListener('gattserverdisconnected', handleWebDisconnect);

        // 10s timeout on web GATT connect as well
        const webConnectPromise = device.gatt.connect();
        const webTimeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('CONNECT_TIMEOUT')), CONNECT_TIMEOUT_MS)
        );
        try {
          await Promise.race([webConnectPromise, webTimeoutPromise]);
        } catch (e: any) {
          if (e?.message === 'CONNECT_TIMEOUT') {
            console.error('[BleContext] Web PM5 connect timed out');
            setErgConnected(false);
            ergDeviceIdRef.current = null;
            try { device.gatt.disconnect(); } catch {}
            throw new Error('Connection timed out. Make sure your PM5 is on and nearby, then try again.');
          }
          throw e;
        }

        ergDeviceIdRef.current = device.id;
        ergDeviceNameRef.current = device.name || 'Concept2 PM5';
        setErgDeviceId(device.id);
        setErgDeviceName(device.name || 'Concept2 PM5');
        setWebErgDevice(device);
        setErgConnected(true);
      }
    } catch (e: any) {
      if (e.name !== 'NotFoundError') {
        console.error('[BleContext] connectPM5 failed:', e.message);
      }
      // Ensure state is fully reset on any failure
      setErgConnected(false);
      ergDeviceIdRef.current = null;
    } finally {
      setErgConnecting(false);
    }
  }, []);

  const disconnectPM5 = useCallback(() => {
    const idToDisconnect = ergDeviceIdRef.current ?? ergDeviceId;
    ergDeviceIdRef.current = null;
    if (Capacitor.isNativePlatform() && idToDisconnect) {
      try {
        BleClient.disconnect(idToDisconnect).catch(() => {});
      } catch {}
    } else if (webErgDevice) {
      try { webErgDevice.gatt.disconnect(); } catch {}
      setWebErgDevice(null);
    }
    // ALWAYS reset state regardless of how disconnect was triggered
    setErgDeviceId(null);
    setErgDeviceName(null);
    setErgConnected(false);
  }, [ergDeviceId, webErgDevice]);

  return (
    <BleContext.Provider value={{
      ergDeviceId,
      ergDeviceName,
      ergConnected,
      ergConnecting,
      webErgDevice,
      connectPM5,
      disconnectPM5,
    }}>
      {children}
    </BleContext.Provider>
  );
}

const disabledValue: BleContextValue = {
  ergDeviceId: null,
  ergDeviceName: null,
  ergConnected: false,
  ergConnecting: false,
  webErgDevice: null,
  // On web: return safe disabled state — never throw
  connectPM5: async () => {
    console.warn('[BleContext] BLE not available on this platform — no-op connect.');
  },
  disconnectPM5: () => {},
};

export function BleProvider({ children }: { children: React.ReactNode }) {
  if (!isNative) {
    return <BleContext.Provider value={disabledValue}>{children}</BleContext.Provider>;
  }
  return <BleProviderNative>{children}</BleProviderNative>;
}

export function useBle() { return useContext(BleContext); }
