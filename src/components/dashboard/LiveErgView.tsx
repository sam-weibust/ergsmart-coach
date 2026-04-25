import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { toDataView } from "@/lib/ble";
import { useBle } from "@/context/BleContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Bluetooth, Heart, Loader2, AlertTriangle, Save } from "lucide-react";
import ForceCurveCanvas from "./ForceCurveCanvas";
import { getSessionUser } from '@/lib/getUser';
import { saveWorkoutToHealth } from "@/services/healthkit";

// ── PM5 BLE UUIDs ─────────────────────────────────────────────
const C2_SERVICE      = "ce060000-43e5-11e4-916c-0800200c9a66";
const C2_ROW_SVC      = "ce060030-43e5-11e4-916c-0800200c9a66";
const C2_GEN_STATUS   = "ce060031-43e5-11e4-916c-0800200c9a66";
const C2_ADD_STATUS   = "ce060032-43e5-11e4-916c-0800200c9a66";
const C2_ADD_STATUS2  = "ce060033-43e5-11e4-916c-0800200c9a66";
const C2_STROKE_DATA  = "ce060034-43e5-11e4-916c-0800200c9a66";
const C2_FORCE_CURVE  = "ce060037-43e5-11e4-916c-0800200c9a66";
const HR_SVC          = "heart_rate";
const HR_CHAR         = "heart_rate_measurement";

// ── Types ──────────────────────────────────────────────────────
interface LiveData {
  elapsedTime: number;   // centiseconds
  distance: number;      // metres
  workoutState: number;  // 0=Idle 1=Countdown 2=Rowing 3=Paused 4=Finished
  strokeRate: number;    // spm
  heartRate: number;     // bpm
  calories: number;
  splitPace: number;     // centiseconds per 500 m
  power: number;         // watts
  driveLength: number;   // centimetres (0.01m units from 0x0033)
  driveTime: number;     // centiseconds (0.01s from 0x0033)
  recoveryTime: number;  // centiseconds (0.01s from 0x0033)
  strokeCount: number;   // accumulated strokes
}

interface StrokePoint {
  dist: number;    // metres
  split: number;   // centiseconds / 500 m (lower = faster)
  spm: number;
  hr: number;
}

// ── Debug logger (first 5 per char) ────────────────────────────
const _lev_dbg: Record<string, number> = {};
function _lev_log(tag: string, dv: DataView, parsed: object) {
  _lev_dbg[tag] = (_lev_dbg[tag] ?? 0) + 1;
  if (_lev_dbg[tag] > 5) return;
  const bytes = Array.from({ length: dv.byteLength }, (_, i) => dv.getUint8(i));
  console.log(`[LiveErg ${tag}] #${_lev_dbg[tag]} raw:`, bytes, '| parsed:', parsed);
}

// ── Parsing helpers ────────────────────────────────────────────
// 0x0031 – Rowing General Status (19 bytes)
// 0-2: elapsed time (0.01s, 24-bit LE)
// 3-5: distance (0.1m, 24-bit LE)
// 6:   split pace (0.5s/500m) → ×50 = centiseconds
// 7:   split power (watts)
// 8:   stroke rate (spm)
// 9:   heart rate (bpm)
// 12:  workout state
function parseGenStatus(dv: DataView): Partial<LiveData> {
  if (dv.byteLength < 13) return {};
  const elapsedTime  = dv.getUint8(0) | (dv.getUint8(1) << 8) | (dv.getUint8(2) << 16);
  const rawDist      = dv.getUint8(3) | (dv.getUint8(4) << 8) | (dv.getUint8(5) << 16);
  const distance     = rawDist / 10;
  const splitPace    = dv.getUint8(6) * 50;   // 0.5s → centiseconds
  const strokeRate   = dv.getUint8(8);          // spm
  const heartRate    = dv.getUint8(9);           // bpm from strap via PM5
  const workoutState = dv.getUint8(12);
  const parsed = { elapsedTime, distance, splitPace, strokeRate, heartRate, workoutState };
  _lev_log('0031', dv, parsed);
  return parsed;
}

// 0x0032 – Rowing Additional Status 1
// 0:   stroke count (uint8)
// 1-2: split pace (centiseconds/500m, uint16 LE)
// 3-4: stroke power (watts, uint16 LE)
// 5:   stroke calories/hour
// 6-7: split avg pace (centiseconds/500m, uint16 LE)
// 8:   split total calories
function parseAddStatus(dv: DataView): Partial<LiveData> {
  if (dv.byteLength < 5) return {};
  const strokeCount = dv.getUint8(0);
  const splitPace   = dv.getUint16(1, true);                          // centiseconds/500m
  const power       = dv.byteLength >= 5 ? dv.getUint16(3, true) : 0; // watts
  const parsed = { strokeCount, splitPace, power };
  _lev_log('0032', dv, parsed);
  return parsed;
}

// 0x0033 – Rowing Additional Status 2 (drive/recovery metrics)
// 0-1: elapsed time (0.01s)
// 2-3: interval count
// 4-5: drive length (0.01m = centimetres, uint16 LE)
// 6:   drive time (0.01s = centiseconds, uint8)
// 7-8: stroke recovery time (0.01s = centiseconds, uint16 LE)
// 9-10: stroke count (uint16 LE)
function parseAdd2Status(dv: DataView): Partial<LiveData> {
  if (dv.byteLength < 9) return {};
  const driveLength  = dv.byteLength >= 6 ? dv.getUint16(4, true) : 0;   // cm
  const driveTime    = dv.byteLength >= 7 ? dv.getUint8(6) : 0;           // centiseconds
  const recoveryTime = dv.byteLength >= 9 ? dv.getUint16(7, true) : 0;    // centiseconds
  const parsed = { driveLength, driveTime, recoveryTime };
  _lev_log('0033', dv, parsed);
  return parsed;
}

// 0x0034 – Stroke Data (fallback if 0x0033 not supported)
// 0:   drive length (cm, uint8)
// 1:   drive time (centiseconds, uint8)
// 2-3: recovery time (centiseconds, uint16 LE)
function parseStrokeData(dv: DataView): Partial<LiveData> {
  if (dv.byteLength < 4) return {};
  const driveLength  = dv.getUint8(0);
  const driveTime    = dv.getUint8(1);
  const recoveryTime = dv.getUint16(2, true);
  _lev_log('0034', dv, { driveLength, driveTime, recoveryTime });
  return { driveLength, driveTime, recoveryTime };
}

// ── Formatters ─────────────────────────────────────────────────
// mm:ss.t  e.g. 3:42.5
function fmtTime(cs: number): string {
  const s      = Math.floor(cs / 100);
  const tenths = Math.floor((cs % 100) / 10);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}.${tenths}`;
  return `${m}:${String(sec).padStart(2,"0")}.${tenths}`;
}

// mm:ss  e.g. 1:52
function fmtPace(cs: number): string {
  if (!cs || cs <= 0 || cs > 100000) return "--:--";
  const s   = Math.floor(cs / 100);
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// 0.00s  e.g. 0.85s
function fmtDriveTime(cs: number): string {
  if (!cs) return "--";
  return `${(cs / 100).toFixed(2)}s`;
}

// 0.00m  e.g. 1.23m
function fmtDriveLength(cm: number): string {
  if (!cm) return "--";
  return `${(cm / 100).toFixed(2)}m`;
}

// Force curve: uint8 per point on native iOS, uint16/10 on web
function parseForceCurve(dv: DataView, isNative: boolean): number[] {
  if (dv.byteLength < 2) return [];
  const count = Math.min(dv.getUint8(0), 32);
  const forces: number[] = [];
  if (isNative) {
    for (let i = 0; i < count && 1 + i < dv.byteLength; i++) {
      forces.push(dv.getUint8(1 + i) * 1.0); // arbitrary units
    }
  } else {
    for (let i = 0; i < count && 1 + i * 2 + 1 < dv.byteLength; i++) {
      forces.push(dv.getUint16(1 + i * 2, true) / 10); // 0.1N → N
    }
  }
  _lev_log('0037', dv, { count, peak: Math.max(...forces, 0) });
  return forces;
}

function parseSplitInput(str: string): number | null {
  const match = str.match(/^(\d+):(\d{1,2}(?:\.\d)?)$/);
  if (!match) return null;
  const mins = parseInt(match[1], 10);
  const secs = parseFloat(match[2]);
  return Math.round((mins * 60 + secs) * 100); // centiseconds
}

const STATE_LABELS = ["Idle", "Countdown", "Rowing", "Paused", "Finished", "--"];

// ── Component ──────────────────────────────────────────────────
export default function LiveErgView() {
  const { toast } = useToast();

  const { ergDeviceId, ergDeviceName, ergConnected, ergConnecting, webErgDevice, connectPM5, disconnectPM5 } = useBle();

  // Assume supported; only set false if BleClient.initialize() actually fails on native,
  // or if Web Bluetooth is absent on web. Never block on uncertain permission state.
  const [btSupported, setBtSupported] = useState(true);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      BleClient.initialize({ requestBluetooth: true }).catch((err) => {
        console.error("[LiveErgView] BleClient.initialize() failed:", err?.message, err?.code, err);
        setBtSupported(false);
      });
    } else if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      setBtSupported(false);
    }
  }, []);

  const [hrConnected,  setHrConnected]  = useState(false);
  const [disconnected, setDisconnected] = useState(false); // mid-workout disconnect
  const wasConnectedRef = useRef(false);

  const [data,    setData]    = useState<Partial<LiveData>>({});
  const [hrBpm,   setHrBpm]   = useState<number | null>(null);
  const [strokes, setStrokes] = useState<StrokePoint[]>([]);
  const [saved,   setSaved]   = useState(false);

  const [currentCurve,        setCurrentCurve]        = useState<number[]>([]);
  const [prevCurve,           setPrevCurve]           = useState<number[]>([]);
  const [allCurves,           setAllCurves]           = useState<number[][]>([]);
  const [forceCurveSupported, setForceCurveSupported] = useState<boolean | null>(null);

  const [targetInput,    setTargetInput]    = useState("");
  const [targetCs,       setTargetCs]       = useState<number | null>(null); // centiseconds
  const [targetDistInput, setTargetDistInput] = useState("");
  const [targetDist,     setTargetDist]     = useState<number | null>(null); // metres

  const hrDeviceRef        = useRef<any>(null);
  const hrNativeDeviceIdRef = useRef<string | null>(null);
  const prevStateRef  = useRef<number | undefined>(undefined);
  const autoSavedRef  = useRef(false);
  const strokesRef    = useRef<StrokePoint[]>([]); // keep in sync for save
  const dataRef         = useRef<Partial<LiveData>>({}); // keep in sync for save
  const currentCurveRef = useRef<number[]>([]);
  const allCurvesRef    = useRef<number[][]>([]);

  // Sync strokes & data to refs for callbacks
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { currentCurveRef.current = currentCurve; }, [currentCurve]);
  useEffect(() => { allCurvesRef.current = allCurves; }, [allCurves]);

  // Track mid-workout disconnect via context ergConnected
  useEffect(() => {
    if (ergConnected) {
      wasConnectedRef.current = true;
      setDisconnected(false);
    } else if (wasConnectedRef.current) {
      setDisconnected(true);
    }
  }, [ergConnected]);

  // Subscribe to PM5 streaming data whenever connected (native or web)
  useEffect(() => {
    if (!ergConnected) return;
    let cancelled = false;

    (async () => {
      const isNative = Capacitor.isNativePlatform();
      if (isNative && ergDeviceId) {
        const tryNotify = async (service: string, char: string, handler: (dv: DataView) => void) => {
          try {
            await BleClient.startNotifications(ergDeviceId, service, char, (value) => {
              if (!cancelled) handler(toDataView(value));
            });
          } catch {}
        };
        await tryNotify(C2_ROW_SVC, C2_GEN_STATUS,  (dv) => accumulateStroke(parseGenStatus(dv)));
        await tryNotify(C2_ROW_SVC, C2_ADD_STATUS,  (dv) => accumulateStroke(parseAddStatus(dv)));
        await tryNotify(C2_ROW_SVC, C2_ADD_STATUS2, (dv) => accumulateStroke(parseAdd2Status(dv)));
        await tryNotify(C2_ROW_SVC, C2_STROKE_DATA, (dv) => accumulateStroke(parseStrokeData(dv)));
        try {
          await BleClient.startNotifications(ergDeviceId, C2_ROW_SVC, C2_FORCE_CURVE, (value) => {
            if (cancelled) return;
            const forces = parseForceCurve(toDataView(value), true /* native */);
            if (forces.length > 0) {
              setForceCurveSupported(true);
              setPrevCurve(currentCurveRef.current.length > 0 ? [...currentCurveRef.current] : []);
              setCurrentCurve(forces);
              setAllCurves(prev => [...prev, forces]);
            }
          });
          if (!cancelled) setForceCurveSupported(true);
        } catch {
          if (!cancelled) setForceCurveSupported(false);
        }
      } else if (!Capacitor.isNativePlatform() && webErgDevice?.gatt?.connected) {
        await resubscribeErg(webErgDevice.gatt);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ergConnected, ergDeviceId]);

  // Accumulate graph points on every splitPace update
  const latestDist  = useRef(0);
  const latestSplit = useRef(0);
  const latestSpm   = useRef(0);
  const latestHr    = useRef(0);

  const accumulateStroke = useCallback((d: Partial<LiveData>) => {
    if (d.distance !== undefined) latestDist.current  = d.distance;
    if (d.splitPace !== undefined) latestSplit.current = d.splitPace;
    if (d.strokeRate !== undefined) latestSpm.current = d.strokeRate;
    if (d.heartRate !== undefined && d.heartRate > 0) latestHr.current = d.heartRate;

    // Only record when actually rowing and we have a valid split
    setData(prev => {
      const next = { ...prev, ...d };
      if ((next.workoutState === 2) && latestSplit.current > 0 && latestDist.current > 0) {
        const point: StrokePoint = {
          dist:  Math.round(latestDist.current),
          split: latestSplit.current,
          spm:   latestSpm.current,
          hr:    latestHr.current,
        };
        setStrokes(prev => {
          // Deduplicate: only push if distance changed meaningfully
          if (prev.length > 0 && prev[prev.length - 1].dist === point.dist) return prev;
          return [...prev, point];
        });
      }
      return next;
    });
  }, []);

  // Auto-save on Rowing→Finished
  useEffect(() => {
    const prev = prevStateRef.current;
    const curr = data.workoutState;
    prevStateRef.current = curr;

    if (prev === 2 && curr === 4 && !autoSavedRef.current) {
      autoSavedRef.current = true;
      saveWorkout(dataRef.current, strokesRef.current);
    }
  }, [data.workoutState]);

  const saveWorkout = async (d: Partial<LiveData>, pts: StrokePoint[]) => {
    if (!d.distance || !d.elapsedTime) return;
    try {
      const user = await getSessionUser();
      if (!user) return;

      const dist    = Math.round(d.distance);
      const dur     = fmtTime(d.elapsedTime);
      const avgSplit = d.elapsedTime > 0 && d.distance > 0
        ? fmtPace(Math.round((d.elapsedTime / d.distance) * 500))
        : null;
      const avgWatts = pts.length > 0 && d.power
        ? Math.round(d.power) : null;

      await (supabase.from("erg_workouts") as any).insert({
        user_id:        user.id,
        workout_type:   "steady_state",
        distance:       dist,
        duration:       dur,
        avg_split:      avgSplit,
        avg_heart_rate: d.heartRate || hrBpm || null,
        calories:       d.calories  || null,
        avg_watts:      avgWatts,
        stroke_data: (() => {
          const hasCurves = allCurvesRef.current.length > 0;
          if (pts.length > 0 && hasCurves) return { strokes: pts, forceCurves: allCurvesRef.current };
          return pts.length > 0 ? pts : null;
        })(),
      });

      // Save to erg_scores for leaderboard-eligible distances
      const BENCHMARK_DISTANCES: Record<number, string> = {
        2000: "2k", 5000: "5k", 6000: "6k", 10000: "10k",
      };
      const TOLERANCE = 15;
      const matchedDist = Object.keys(BENCHMARK_DISTANCES).find(
        bd => Math.abs(dist - parseInt(bd)) <= TOLERANCE
      );
      const is60min = Math.abs(d.elapsedTime / 100 - 3600) <= 30; // ±30s
      const testType = is60min
        ? "60min"
        : matchedDist ? BENCHMARK_DISTANCES[parseInt(matchedDist)] : null;

      if (testType) {
        const timeSeconds = d.elapsedTime / 100;
        const splitSecs = d.elapsedTime > 0 && d.distance > 0
          ? (timeSeconds / dist) * 500 : null;
        const { data: profile } = await supabase
          .from("profiles")
          .select("weight_kg")
          .eq("id", user.id)
          .maybeSingle();
        const wkg = avgWatts && profile?.weight_kg
          ? avgWatts / profile.weight_kg : null;
        await (supabase.from("erg_scores") as any).insert({
          user_id: user.id,
          test_type: testType,
          time_seconds: testType === "60min" ? null : Math.round(timeSeconds),
          total_meters: testType === "60min" ? dist : null,
          avg_split_seconds: splitSecs,
          watts: avgWatts,
          watts_per_kg: wkg,
          source: "live_erg",
          is_verified: true,
          to_leaderboard: true,
        });
      }

      setSaved(true);
      toast({ title: "Workout saved", description: `${dist}m in ${dur}` });

      // Save to Apple Health on iOS (no-op on web/Android)
      const savedToHealth = await saveWorkoutToHealth({
        startDate: new Date(Date.now() - (d.elapsedTime / 100) * 1000).toISOString(),
        durationSeconds: Math.round(d.elapsedTime / 100),
        distanceMeters: dist,
        calories: d.calories ?? Math.round((avgWatts ?? 0) * (d.elapsedTime / 100) * 0.00024 * 1000),
      });
      if (savedToHealth) {
        toast({ title: "Saved to Apple Health", description: "Rowing workout recorded." });
      }
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  // ── BT: connect HR ───────────────────────────────────────────
  const connectHR = useCallback(async () => {
    if (!btSupported) return;
    try {
      if (Capacitor.isNativePlatform()) {
        // Native: use BleClient for HR
        const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
        const HR_CHAR_UUID    = '00002a37-0000-1000-8000-00805f9b34fb';
        const device = await BleClient.requestDevice({ services: [HR_SERVICE_UUID] });
        const deviceId = device.deviceId;
        hrNativeDeviceIdRef.current = deviceId;
        await BleClient.connect(deviceId, () => {
          setHrConnected(false);
          setHrBpm(null);
          toast({ title: "HR Monitor Disconnected" });
        });
        await BleClient.startNotifications(deviceId, HR_SERVICE_UUID, HR_CHAR_UUID, (value) => {
          const dv = toDataView(value);
          const isU16 = dv.getUint8(0) & 0x1;
          const hr = isU16 ? dv.getUint16(1, true) : dv.getUint8(1);
          setHrBpm(hr);
          latestHr.current = hr;
        });
        setHrConnected(true);
        toast({ title: "HR Connected", description: device.name || "Heart Rate Monitor" });
      } else {
        // Web Bluetooth
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [{ services: [HR_SVC] }],
        });
        const connectAndSubscribe = async () => {
          const server  = await device.gatt!.connect();
          const service = await server.getPrimaryService(HR_SVC);
          const char    = await service.getCharacteristic(HR_CHAR);
          await char.startNotifications();
          char.addEventListener("characteristicvaluechanged", (e: any) => {
            const dv = e.target.value as DataView;
            const isU16 = dv.getUint8(0) & 0x1;
            const hr = isU16 ? dv.getUint16(1, true) : dv.getUint8(1);
            setHrBpm(hr);
            latestHr.current = hr;
          });
        };
        device.addEventListener("gattserverdisconnected", async () => {
          setHrConnected(false);
          setHrBpm(null);
          try {
            await connectAndSubscribe();
            setHrConnected(true);
            toast({ title: "HR Monitor Reconnected" });
          } catch {
            toast({ title: "HR Monitor Disconnected" });
          }
        });
        await connectAndSubscribe();
        hrDeviceRef.current = device;
        setHrConnected(true);
        toast({ title: "HR Connected", description: device.name || "Heart Rate Monitor" });
      }
    } catch (e: any) {
      if (e.name !== "NotFoundError") {
        toast({ title: "HR Connect Failed", description: e.message, variant: "destructive" });
      }
    }
  }, [btSupported, toast]);

  // ── BT: connect Erg (via BleContext for cross-page persistence) ─────────────
  const connectErg = useCallback(async () => {
    if (!btSupported) return;
    autoSavedRef.current = false;
    prevStateRef.current = undefined;
    setSaved(false);
    setCurrentCurve([]);
    setPrevCurve([]);
    setAllCurves([]);
    setForceCurveSupported(null);
    wasConnectedRef.current = false;
    await connectPM5();
  }, [btSupported, connectPM5]);

  // ── Web-only: re-subscribe GATT characteristics on an existing server ────────
  const resubscribeErg = async (server: any) => {
    const svc = await server.getPrimaryService(C2_ROW_SVC);

    try {
      const gc = await svc.getCharacteristic(C2_GEN_STATUS);
      await gc.startNotifications();
      gc.addEventListener("characteristicvaluechanged", (e: any) => {
        accumulateStroke(parseGenStatus(e.target.value));
      });
    } catch {}

    try {
      const ac = await svc.getCharacteristic(C2_ADD_STATUS);
      await ac.startNotifications();
      ac.addEventListener("characteristicvaluechanged", (e: any) => {
        accumulateStroke(parseAddStatus(e.target.value));
      });
    } catch {}

    try {
      const a2c = await svc.getCharacteristic(C2_ADD_STATUS2);
      await a2c.startNotifications();
      a2c.addEventListener("characteristicvaluechanged", (e: any) => {
        accumulateStroke(parseAdd2Status(e.target.value));
      });
    } catch {}

    try {
      const sc = await svc.getCharacteristic(C2_STROKE_DATA);
      await sc.startNotifications();
      sc.addEventListener("characteristicvaluechanged", (e: any) => {
        accumulateStroke(parseStrokeData(e.target.value));
      });
    } catch {}

    try {
      const fcc = await svc.getCharacteristic(C2_FORCE_CURVE);
      await fcc.startNotifications();
      fcc.addEventListener("characteristicvaluechanged", (e: any) => {
        const forces = parseForceCurve(e.target.value, false /* web */);
        if (forces.length > 0) {
          setForceCurveSupported(true);
          setPrevCurve(currentCurveRef.current.length > 0 ? [...currentCurveRef.current] : []);
          setCurrentCurve(forces);
          setAllCurves(prev => [...prev, forces]);
        }
      });
      setForceCurveSupported(true);
    } catch {
      setForceCurveSupported(false);
    }
  };

  const disconnectErg = useCallback(() => {
    wasConnectedRef.current = false;
    disconnectPM5();
  }, [disconnectPM5]);

  // ── Target split ─────────────────────────────────────────────
  const applyTarget = () => {
    const cs = parseSplitInput(targetInput);
    if (cs) {
      setTargetCs(cs);
      toast({ title: `Target set: ${fmtPace(cs)}/500m` });
    } else {
      toast({ title: "Invalid format", description: "Use m:ss e.g. 2:00", variant: "destructive" });
    }
  };

  const applyTargetDist = () => {
    const d = parseInt(targetDistInput, 10);
    if (d > 0 && d <= 100000) {
      setTargetDist(d);
      toast({ title: `Target distance: ${d}m` });
    } else {
      toast({ title: "Invalid distance", description: "Enter metres e.g. 2000", variant: "destructive" });
    }
  };

  // ── Projected finish time ─────────────────────────────────────
  const projLabel = targetDist != null ? "Proj. Finish" : "Proj. 2000m";
  const projValue = (() => {
    const sc = data.strokeCount ?? 0;
    const sp = data.splitPace ?? 0;
    if (sc < 10 || !sp || sp <= 0 || sp > 100000) return "--:--";
    const effectiveDist = targetDist ?? 2000;
    const totalSecs = (sp / 100) * effectiveDist / 500;
    const m   = Math.floor(totalSecs / 60);
    const sec = Math.round(totalSecs % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  })();

  // ── Derived display values ────────────────────────────────────
  const state     = data.workoutState ?? 0;
  const isRowing  = state === 2;
  const isFinished = state === 4;
  const hr        = (data.heartRate && data.heartRate > 0) ? data.heartRate : hrBpm;

  // Y-axis tick formatter for the graph (split in centiseconds → m:ss)
  const fmtYTick = (v: number) => fmtPace(v);

  // Graph y-domain: auto with some padding, inverted (lower = faster = top)
  const splitValues = strokes.map(s => s.split).filter(Boolean);
  const minSplit = splitValues.length ? Math.min(...splitValues) - 500 : 6000;
  const maxSplit = splitValues.length ? Math.max(...splitValues) + 500 : 12000;

  const statBlocks = [
    { label: "Split /500m",   value: fmtPace(data.splitPace ?? 0),                               big: true  },
    { label: "Stroke Rate",   value: data.strokeRate ? `${data.strokeRate} spm` : "-- spm",       big: false },
    { label: "Distance",      value: data.distance   ? `${Math.round(data.distance)}m` : "--m",   big: false },
    { label: "Elapsed",       value: data.elapsedTime ? fmtTime(data.elapsedTime) : "--:--.0",     big: false },
    { label: "Calories",      value: data.calories   ? `${data.calories} cal` : "-- cal",          big: false },
    { label: "Power",         value: data.power      ? `${data.power} W` : "-- W",                 big: false },
    { label: "Heart Rate",    value: hr ? `${hr} bpm` : "-- bpm",                                  big: false },
    { label: "Drive Length",  value: data.driveLength ? fmtDriveLength(data.driveLength) : "--m",  big: false },
    { label: "Drive Time",    value: data.driveTime ? fmtDriveTime(data.driveTime) : "--",          big: false },
    { label: "Recovery Time", value: data.recoveryTime ? fmtDriveTime(data.recoveryTime) : "--",   big: false },
    { label: projLabel,       value: projValue,                                                     big: false },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col overflow-x-hidden">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${ergConnected ? "bg-green-400 animate-pulse" : disconnected ? "bg-yellow-400 animate-pulse" : "bg-gray-600"}`} />
          <span className="text-sm font-medium text-gray-300">
            {ergConnected
              ? `PM5 — ${STATE_LABELS[state] ?? "--"}`
              : disconnected
              ? "Reconnecting…"
              : "Not connected"}
          </span>
          {hrConnected && (
            <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
              <Heart className="h-3 w-3" />
              {hr ? `${hr} bpm` : "--"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!hrConnected && btSupported && (
            <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white text-xs h-7 px-2" onClick={connectHR}>
              <Heart className="h-3 w-3 mr-1" /> HR
            </Button>
          )}
          {ergConnected ? (
            <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white text-sm h-10 px-3 min-w-[44px]" onClick={disconnectErg}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" className="h-10 text-sm px-4 min-w-[44px]" onClick={connectErg} disabled={ergConnecting || !btSupported}>
              {ergConnecting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Connecting…</>
                : <><Bluetooth className="h-4 w-4 mr-1.5" />Connect PM5</>}
            </Button>
          )}
        </div>
      </div>

      {/* ── Target split + reconnect notices ── */}
      {!ergConnected && !disconnected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 bg-gray-900 border-b border-gray-800">
          <span className="text-xs text-gray-400 shrink-0">Target split:</span>
          <Input
            value={targetInput}
            onChange={e => setTargetInput(e.target.value)}
            placeholder="e.g. 2:00"
            className="h-7 w-20 bg-gray-800 border-gray-700 text-white text-xs font-mono"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-700 text-gray-300 hover:text-white" onClick={applyTarget}>
            Set
          </Button>
          {targetCs && (
            <span className="text-xs text-green-400 font-mono">→ {fmtPace(targetCs)}/500m</span>
          )}
          <span className="text-xs text-gray-600">|</span>
          <span className="text-xs text-gray-400 shrink-0">Target dist:</span>
          <Input
            value={targetDistInput}
            onChange={e => setTargetDistInput(e.target.value)}
            placeholder="e.g. 2000"
            className="h-7 w-20 bg-gray-800 border-gray-700 text-white text-xs font-mono"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-700 text-gray-300 hover:text-white" onClick={applyTargetDist}>
            Set
          </Button>
          {targetDist && (
            <span className="text-xs text-blue-400 font-mono">→ {targetDist}m</span>
          )}
        </div>
      )}

      {disconnected && (
        <div className="flex items-center gap-3 px-4 py-2 bg-yellow-900/30 border-b border-yellow-700/40">
          <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-300">Connection lost — data preserved. Auto-reconnecting…</span>
          <Button size="sm" variant="outline" className="ml-auto h-6 text-xs border-yellow-600 text-yellow-300" onClick={connectErg} disabled={ergConnecting}>
            {ergConnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reconnect"}
          </Button>
        </div>
      )}

      {/* ── Big stat grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-gray-800 border-b border-gray-800 flex-shrink-0">
        {statBlocks.map(({ label, value, big }) => (
          <div key={label} className={`flex flex-col items-center justify-center py-5 px-2 ${big ? "bg-gray-900 col-span-2 sm:col-span-1" : "bg-gray-950"}`}>
            <span className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</span>
            <span className={`font-mono font-bold tabular-nums leading-none ${big ? "text-4xl sm:text-5xl text-green-400" : "text-2xl sm:text-3xl text-white"}`}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Stroke graph ── */}
      <div className="flex-1 min-h-0 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500 uppercase tracking-widest">Split over distance</span>
          {isFinished && !saved && (
            <Button size="sm" className="h-7 text-xs" onClick={() => saveWorkout(dataRef.current, strokesRef.current)}>
              <Save className="h-3 w-3 mr-1" /> Save workout
            </Button>
          )}
          {saved && (
            <span className="text-xs text-green-400">Saved</span>
          )}
        </div>

        {strokes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-700 text-sm">
            {ergConnected ? "Start rowing to see graph" : "Connect to PM5 to begin"}
          </div>
        ) : (
          <div className="flex-1 min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={strokes} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="dist"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={v => `${v}m`}
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                />
                <YAxis
                  reversed
                  domain={[minSplit, maxSplit]}
                  tickFormatter={fmtYTick}
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  axisLine={{ stroke: "#374151" }}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={v => `${v}m`}
                  formatter={(value: any, name: string) => {
                    if (name === "split") return [fmtPace(value), "Split /500m"];
                    if (name === "spm")   return [value + " spm", "Stroke Rate"];
                    if (name === "hr")    return [value + " bpm", "Heart Rate"];
                    return [value, name];
                  }}
                />
                {/* Target split pacer line */}
                {targetCs && (
                  <ReferenceLine y={targetCs} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: `Target ${fmtPace(targetCs)}`, fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="split"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#4ade80" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Force Curve (Canvas) ── */}
      {forceCurveSupported !== false && currentCurve.length > 0 && (
        <div className="px-4 pb-4">
          <ForceCurveCanvas
            currentCurve={currentCurve}
            prevCurve={prevCurve}
            allCurves={allCurves}
            driveTime={data.driveTime}
            recoveryTime={data.recoveryTime}
            strokeCount={allCurves.length}
          />
        </div>
      )}

      {/* ── Force curve not supported note ── */}
      {forceCurveSupported === false && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-600 text-center">
            Force curve data not available for this PM5 firmware version.
          </p>
        </div>
      )}

      {/* ── Not supported (web browsers without Web Bluetooth) ── */}
      {!btSupported && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/95">
          <div className="text-center p-8">
            <AlertTriangle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
            <p className="text-lg font-semibold mb-2">Web Bluetooth not supported</p>
            <p className="text-sm text-gray-400">Use Chrome or Edge on desktop, or the CrewSync iOS app to connect your PM5.</p>
          </div>
        </div>
      )}
    </div>
  );
}
