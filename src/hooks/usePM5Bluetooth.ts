import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  initBle, listDevices, connectToDevice, startStreaming, disconnectDevice,
  BleDevice, PM5StreamData,
} from "@/lib/ble";

export interface PM5Data {
  strokeRate: number | null;
  splitTime: string | null;
  distance: number | null;
  watts: number | null;
  heartRate: number | null;
  elapsedTime: string | null;
  calories: number | null;
  driveLength: number | null;
  driveTime: number | null;
  recoveryTime: number | null;
  workoutState: number | null;
}

function formatTime(centiseconds: number): string {
  const s = Math.floor(centiseconds / 100);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatSplit(centiseconds: number): string {
  if (!centiseconds || centiseconds <= 0 || centiseconds > 100000) return "--:--";
  const s = Math.floor(centiseconds / 100);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function usePM5Bluetooth() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [pm5Data, setPm5Data] = useState<PM5Data>({
    strokeRate: null, splitTime: null, distance: null, watts: null,
    heartRate: null, elapsedTime: null, calories: null, driveLength: null,
    driveTime: null, recoveryTime: null, workoutState: null,
  });

  const scan = useCallback(async () => {
    setScanning(true);
    setDevices([]);
    try {
      await initBle();
      const found = await listDevices(5000);
      setDevices(found);
      if (found.length === 0) {
        toast({ title: "No Devices Found", description: "Make sure your PM5 is awake and in range." });
      }
    } catch (e: any) {
      toast({ title: "Scan Failed", description: e.message || "Could not scan for devices.", variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [toast]);

  const connect = useCallback(async (deviceId: string, deviceName?: string) => {
    setConnecting(true);
    try {
      await connectToDevice(deviceId, () => {
        setConnected(false);
        setConnectedDeviceId(null);
        toast({ title: "Erg Disconnected", description: "Attempting to reconnect…" });
      });

      await startStreaming(deviceId, (update: Partial<PM5StreamData>) => {
        setPm5Data(prev => {
          // Derive watts from split pace using Concept2 formula: 2.80 / (pace_sec/500)^3
          let watts = prev.watts;
          if (update.splitPace != null && update.splitPace > 0) {
            const paceSec = update.splitPace / 100;
            watts = Math.round(2.80 / Math.pow(paceSec / 500, 3));
          } else if (update.power != null) {
            watts = update.power;
          }
          return {
            ...prev,
            strokeRate:   update.strokeRate   ?? prev.strokeRate,
            distance:     update.distance     != null ? Math.round(update.distance) : prev.distance,
            watts,
            heartRate:    update.heartRate    ?? prev.heartRate,
            calories:     update.calories     ?? prev.calories,
            driveLength:  update.driveLength  ?? prev.driveLength,
            driveTime:    update.driveTime    ?? prev.driveTime,
            recoveryTime: update.recoveryTime ?? prev.recoveryTime,
            workoutState: update.workoutState ?? prev.workoutState,
            elapsedTime:  update.elapsedTime  != null ? formatTime(update.elapsedTime) : prev.elapsedTime,
            splitTime:    update.splitPace    != null ? formatSplit(update.splitPace)  : prev.splitTime,
          };
        });
      });

      setConnectedDeviceId(deviceId);
      setConnected(true);
      toast({ title: "PM5 Connected!", description: deviceName || "Concept2 Erg" });
    } catch (e: any) {
      toast({ title: "Connection Failed", description: e.message || "Could not connect.", variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  }, [toast]);

  const disconnect = useCallback(async () => {
    if (connectedDeviceId) {
      await disconnectDevice(connectedDeviceId);
    }
    setConnected(false);
    setConnectedDeviceId(null);
    setPm5Data({
      strokeRate: null, splitTime: null, distance: null, watts: null,
      heartRate: null, elapsedTime: null, calories: null, driveLength: null,
      driveTime: null, recoveryTime: null, workoutState: null,
    });
  }, [connectedDeviceId]);

  return {
    connected, connecting, scanning, devices, pm5Data, connectedDeviceId,
    scan, connect, disconnect,
    isSupported: true,
  };
}
