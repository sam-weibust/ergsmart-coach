import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { initBle, isNativePlatform } from '@/lib/ble';

const PM5_SERVICE        = 'ce060000-43e5-11e4-916c-0800200c9a66';
const PM5_ROWING_SERVICE = 'ce060030-43e5-11e4-916c-0800200c9a66';

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

export function BleProvider({ children }: { children: React.ReactNode }) {
  const [ergDeviceId, setErgDeviceId]     = useState<string | null>(null);
  const [ergDeviceName, setErgDeviceName] = useState<string | null>(null);
  const [ergConnected, setErgConnected]   = useState(false);
  const [ergConnecting, setErgConnecting] = useState(false);
  const [webErgDevice, setWebErgDevice]   = useState<any | null>(null);

  // Keep a stable ref to deviceId for callbacks
  const ergDeviceIdRef = useRef<string | null>(null);

  const connectPM5 = useCallback(async () => {
    setErgConnecting(true);
    try {
      if (isNativePlatform()) {
        await initBle();

        const device = await BleClient.requestDevice({
          services: [PM5_SERVICE],
          optionalServices: [PM5_ROWING_SERVICE],
        });
        const id = device.deviceId;
        ergDeviceIdRef.current = id;

        const handleDisconnect = () => {
          setErgConnected(false);
          // Auto-reconnect
          setTimeout(async () => {
            const currentId = ergDeviceIdRef.current;
            if (!currentId) return;
            try {
              await BleClient.connect(currentId, handleDisconnect);
              setErgConnected(true);
            } catch {}
          }, 2000);
        };

        await BleClient.connect(id, handleDisconnect);
        setErgDeviceId(id);
        setErgDeviceName(device.name || 'Concept2 PM5');
        setErgConnected(true);
      } else {
        // Web Bluetooth
        if (typeof navigator === 'undefined' || !(navigator as any).bluetooth) {
          console.error('[BleContext] Web Bluetooth not available');
          return;
        }
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [
            { services: [PM5_SERVICE] },
            { namePrefix: 'PM5' },
            { namePrefix: 'Concept2' },
          ],
          optionalServices: [PM5_ROWING_SERVICE],
        });

        const handleWebDisconnect = async () => {
          setErgConnected(false);
          setTimeout(async () => {
            try {
              await device.gatt.connect();
              setErgConnected(true);
            } catch {}
          }, 2000);
        };

        device.addEventListener('gattserverdisconnected', handleWebDisconnect);
        await device.gatt.connect();

        ergDeviceIdRef.current = device.id;
        setErgDeviceId(device.id);
        setErgDeviceName(device.name || 'Concept2 PM5');
        setWebErgDevice(device);
        setErgConnected(true);
      }
    } catch (e: any) {
      if (e.name !== 'NotFoundError') {
        console.error('[BleContext] connectPM5 failed:', e.message);
      }
    } finally {
      setErgConnecting(false);
    }
  }, []);

  const disconnectPM5 = useCallback(() => {
    ergDeviceIdRef.current = null;
    if (isNativePlatform() && ergDeviceId) {
      BleClient.disconnect(ergDeviceId).catch(() => {});
    } else if (webErgDevice) {
      try { webErgDevice.gatt.disconnect(); } catch {}
      setWebErgDevice(null);
    }
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

export function useBle() { return useContext(BleContext); }
