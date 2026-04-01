import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

const PM5_SERVICE_UUID = "ce060000-43e5-11e4-916c-0800200c9a66";
const PM5_ROWING_SERVICE = "ce060030-43e5-11e4-916c-0800200c9a66";
const PM5_GENERAL_STATUS_CHAR = "ce060031-43e5-11e4-916c-0800200c9a66";
const PM5_ADDITIONAL_STATUS_CHAR = "ce060032-43e5-11e4-916c-0800200c9a66";

export interface PM5Data {
  strokeRate: number | null;
  splitTime: string | null;
  distance: number | null;
  watts: number | null;
  heartRate: number | null;
  elapsedTime: string | null;
}

export function usePM5Bluetooth() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pm5Data, setPm5Data] = useState<PM5Data>({
    strokeRate: null, splitTime: null, distance: null, watts: null, heartRate: null, elapsedTime: null,
  });
  const deviceRef = useRef<any>(null);

  const isSupported = typeof navigator !== "undefined" && "bluetooth" in navigator;

  const connect = useCallback(async () => {
    if (!isSupported) {
      toast({ title: "Bluetooth Not Available", description: "Your browser doesn't support Web Bluetooth. Use manual entry.", variant: "destructive" });
      return;
    }
    setConnecting(true);
    try {
      const nav = navigator as any;
      const device = await nav.bluetooth.requestDevice({
        filters: [
          { services: [PM5_SERVICE_UUID] },
          { namePrefix: "PM5" },
        ],
        optionalServices: [PM5_ROWING_SERVICE],
      });

      device.addEventListener("gattserverdisconnected", () => {
        setConnected(false);
        toast({ title: "PM5 Disconnected", description: "Erg connection lost." });
      });

      const server = await device.gatt.connect();
      deviceRef.current = device;

      try {
        const service = await server.getPrimaryService(PM5_ROWING_SERVICE);
        
        // Try general status characteristic
        try {
          const generalChar = await service.getCharacteristic(PM5_GENERAL_STATUS_CHAR);
          await generalChar.startNotifications();
          generalChar.addEventListener("characteristicvaluechanged", (event: any) => {
            const value = event.target.value as DataView;
            if (value.byteLength >= 10) {
              const elapsed = value.getUint8(0) | (value.getUint8(1) << 8) | (value.getUint8(2) << 16);
              const distance = (value.getUint8(3) | (value.getUint8(4) << 8) | (value.getUint8(5) << 16)) / 10;
              const strokeRate = value.getUint8(9);
              
              const elapsedSecs = elapsed / 100;
              const mins = Math.floor(elapsedSecs / 60);
              const secs = (elapsedSecs % 60).toFixed(1);
              
              setPm5Data(prev => ({
                ...prev,
                distance: Math.round(distance),
                strokeRate,
                elapsedTime: `${mins}:${parseFloat(secs) < 10 ? "0" : ""}${secs}`,
              }));
            }
          });
        } catch {}

        // Try additional status
        try {
          const additionalChar = await service.getCharacteristic(PM5_ADDITIONAL_STATUS_CHAR);
          await additionalChar.startNotifications();
          additionalChar.addEventListener("characteristicvaluechanged", (event: any) => {
            const value = event.target.value as DataView;
            if (value.byteLength >= 6) {
              const splitTime = (value.getUint8(2) | (value.getUint8(3) << 8)) / 100;
              const watts = value.getUint8(4) | (value.getUint8(5) << 8);
              
              const splitMins = Math.floor(splitTime / 60);
              const splitSecs = (splitTime % 60).toFixed(1);
              
              setPm5Data(prev => ({
                ...prev,
                splitTime: `${splitMins}:${parseFloat(splitSecs) < 10 ? "0" : ""}${splitSecs}`,
                watts,
              }));
            }
          });
        } catch {}
      } catch {
        // Service not available - still connected
      }

      setConnected(true);
      toast({ title: "PM5 Connected!", description: `Connected to ${device.name || "Concept2 PM5"}` });
    } catch (e: any) {
      if (e.name !== "NotFoundError") {
        toast({ title: "Connection Failed", description: e.message || "Could not connect to PM5", variant: "destructive" });
      }
    } finally {
      setConnecting(false);
    }
  }, [isSupported, toast]);

  const disconnect = useCallback(() => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    setConnected(false);
    deviceRef.current = null;
  }, []);

  return { connected, connecting, pm5Data, connect, disconnect, isSupported };
}
