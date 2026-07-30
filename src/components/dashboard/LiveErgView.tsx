import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { BleClient } from "@capacitor-community/bluetooth-le";
import {
  initBle,
  toDataView,
  parseCharacteristic,
  parseHRMeasurement,
  PM5_FORCE_CURVE_CHAR,
  PM5_FORCE_CURVE_LEGACY,
} from "@/lib/ble";
import { buildForceCurveAreaData, forceCurveAxisMax } from "@/lib/forceCurve";
import { useBle } from "@/context/BleContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/TimeInput";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { invokeAI } from "@/lib/aiInvoke";
import { Bluetooth, Heart, Loader2, AlertTriangle, Sparkles, Square } from "lucide-react";
import ForceCurveCanvas from "./ForceCurveCanvas";
import { WorkoutFeedback } from "./WorkoutFeedback";
import { getSessionUser } from '@/lib/getUser';
import {
  fmtTime, fmtPace, fmtWatts, fmtStrokeRate, fmtDistance,
  fmtDriveTime, fmtDriveLength, parseSplitInput,
  csToInterval, localDateISO,
} from "@/lib/ergFormat";

// ── PM5 BLE UUIDs ─────────────────────────────────────────────
const C2_ROW_SVC      = "ce060030-43e5-11e4-916c-0800200c9a66";
const C2_GEN_STATUS   = "ce060031-43e5-11e4-916c-0800200c9a66"; // primary status
const C2_ADD_STATUS   = "ce060032-43e5-11e4-916c-0800200c9a66"; // power & calories
const C2_ADD_STATUS2  = "ce060033-43e5-11e4-916c-0800200c9a66"; // drive metrics
// Per user spec: force curve characteristic UUID ce060393
const C2_FORCE_CURVE  = PM5_FORCE_CURVE_CHAR;
const C2_FORCE_CURVE_FALLBACK = PM5_FORCE_CURVE_LEGACY;
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

// Formatters live in src/lib/ergFormat.ts so they can be unit-tested against
// known PM5 byte payloads (npm run test:pm5).

// Grace period before a dropped PM5 connection counts as the end of the
// session — BleContext retries the connection at 2 s, so give it room to win.
const DISCONNECT_SAVE_GRACE_MS = 8000;

/**
 * The erg_workouts row an auto-saved live session writes. Loosely typed on
 * purpose: insertErgWorkout() deletes keys the database hasn't migrated yet.
 */
type ErgWorkoutRow = Record<string, string | number | object | null | undefined>;

/** AI feedback shape returned by the analyze-workout edge function. */
interface AIFeedback {
  overallRating: "excellent" | "good" | "average" | "needs_improvement";
  summary: string;
  strengths: string[];
  improvements: string[];
  recommendation: string;
  motivationalMessage: string;
  progressNote?: string;
}

const STATE_LABELS = ["Idle", "Countdown", "Rowing", "Paused", "Finished", "--"];

// ── Component ──────────────────────────────────────────────────
export default function LiveErgView() {
  if (!Capacitor.isNativePlatform()) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center p-8">
          <Bluetooth className="h-12 w-12 text-blue-400 mx-auto mb-4" />
          <p className="text-lg font-semibold mb-2">Connect via the iOS app for live erg tracking</p>
          <p className="text-sm text-gray-400">Live BLE connection to your PM5 requires the native iOS app.</p>
        </div>
      </div>
    );
  }
  return <LiveErgViewNative />;
}

function LiveErgViewNative() {
  const { toast } = useToast();

  const { ergDeviceId, ergDeviceName, ergConnected, ergConnecting, webErgDevice, connectPM5, disconnectPM5 } = useBle();

  const [btSupported, setBtSupported] = useState(true);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) { setBtSupported(false); return; }
    // Route through initBle() so BleClient.initialize runs at most once (isInitialized guard).
    initBle()
      .then((status) => { if (status !== "ready") setBtSupported(false); })
      .catch((err) => {
        console.error("[LiveErgView] initBle() failed:", err);
        setBtSupported(false);
      });
  }, []);

  const [hrConnected,  setHrConnected]  = useState(false);
  const [disconnected, setDisconnected] = useState(false); // mid-workout disconnect
  const wasConnectedRef = useRef(false);

  const [data,    setData]    = useState<Partial<LiveData>>({});
  const [hrBpm,   setHrBpm]   = useState<number | null>(null);
  const [strokes, setStrokes] = useState<StrokePoint[]>([]);
  const [saved,   setSaved]   = useState(false);

  const [analyzing,    setAnalyzing]    = useState(false);
  const [feedback,     setFeedback]     = useState<AIFeedback | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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

  // Every reading taken during the session — averages/extremes are computed from
  // these on save, not from the last frame the PM5 happened to send.
  const splitSamplesRef = useRef<number[]>([]);   // centiseconds / 500 m
  const wattSamplesRef  = useRef<number[]>([]);   // watts
  const spmSamplesRef   = useRef<number[]>([]);   // strokes / minute
  const hrSamplesRef    = useRef<number[]>([]);   // bpm
  // Peak elapsed time / distance seen, so a disconnect frame of zeros can't
  // shrink the saved workout.
  const peakElapsedRef  = useRef(0);
  const peakDistRef     = useRef(0);
  const disconnectSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const tryNotify = async (service: string, char: string) => {
          if (!Capacitor.isNativePlatform()) return;
          try {
            await BleClient.startNotifications(ergDeviceId, service, char, (value) => {
              if (cancelled) return;
              const dv = toDataView(value);
              const parsed = parseCharacteristic(char, dv);
              accumulateStroke(parsed as Partial<LiveData>);
            });
          } catch {}
        };
        await tryNotify(C2_ROW_SVC, C2_GEN_STATUS);
        await tryNotify(C2_ROW_SVC, C2_ADD_STATUS);
        await tryNotify(C2_ROW_SVC, C2_ADD_STATUS2);

        // Force curve subscription — try primary (ce060393) then fallback (ce060035)
        let forceCurveSubscribed = false;
        const subscribeForceCurve = async (charUuid: string) => {
          if (!Capacitor.isNativePlatform()) return false;
          try {
            await BleClient.startNotifications(ergDeviceId, C2_ROW_SVC, charUuid, (value) => {
              if (cancelled) return;
              const dv = toDataView(value);
              const parsed = parseCharacteristic(charUuid, dv);
              const forces = (parsed as any).forceCurve as number[] | undefined;
              if (forces && forces.length > 0) {
                setForceCurveSupported(true);
                setPrevCurve(currentCurveRef.current.length > 0 ? [...currentCurveRef.current] : []);
                setCurrentCurve(forces);
                setAllCurves(prev => [...prev, forces]);
              }
            });
            return true;
          } catch {
            return false;
          }
        };

        forceCurveSubscribed = await subscribeForceCurve(C2_FORCE_CURVE);
        if (!forceCurveSubscribed) {
          forceCurveSubscribed = await subscribeForceCurve(C2_FORCE_CURVE_FALLBACK);
        }
        if (!cancelled) {
          setForceCurveSupported(forceCurveSubscribed);
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

    // Session-long sample collection for the auto-save averages. Bounds mirror
    // the sanity ranges in ble.ts so an idle or garbled frame can't skew a mean.
    if (d.splitPace   && d.splitPace >= 6000 && d.splitPace <= 30000) splitSamplesRef.current.push(d.splitPace);
    if (d.power       && d.power > 0 && d.power <= 2000)              wattSamplesRef.current.push(d.power);
    if (d.strokeRate  && d.strokeRate > 0 && d.strokeRate <= 60)      spmSamplesRef.current.push(d.strokeRate);
    if (d.heartRate   && d.heartRate >= 40 && d.heartRate <= 220)     hrSamplesRef.current.push(d.heartRate);
    if (d.elapsedTime && d.elapsedTime > peakElapsedRef.current)      peakElapsedRef.current = d.elapsedTime;
    if (d.distance    && d.distance    > peakDistRef.current)         peakDistRef.current    = d.distance;

    // Only record when actually rowing and we have a valid split
    setData(prev => {
      const next = { ...prev, ...d };
      // If workoutState is not present, infer "rowing" from increasing distance + valid split
      const inferRowing = (next.workoutState === undefined || next.workoutState === null) &&
        latestSplit.current > 0 && latestDist.current > 0;
      const isRowing = (next.workoutState === 2) || inferRowing;
      if (isRowing && latestSplit.current > 0 && latestDist.current > 0) {
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

  // ── Session end ──────────────────────────────────────────────
  // A Bluetooth session is never saved by hand: it saves itself when the PM5
  // reports Finished, when the athlete taps Stop, or when the PM5 goes away.
  const endSession = useCallback((reason: "finished" | "stop" | "disconnect") => {
    if (autoSavedRef.current) return;
    // Nothing rowed — don't create an empty row.
    if (!peakDistRef.current || !peakElapsedRef.current) return;
    autoSavedRef.current = true;
    console.log(`[LiveErg] session ended (${reason}) — auto-saving`);
    void saveWorkout(dataRef.current, strokesRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on Rowing→Finished
  useEffect(() => {
    const prev = prevStateRef.current;
    const curr = data.workoutState;
    prevStateRef.current = curr;

    if (prev === 2 && curr === 4) endSession("finished");
  }, [data.workoutState, endSession]);

  // Auto-save when the PM5 drops out mid-session. BleContext retries at 2 s, so
  // wait out the grace period first — a brief dropout is not the end of a piece.
  useEffect(() => {
    if (ergConnected) {
      if (disconnectSaveTimer.current) {
        clearTimeout(disconnectSaveTimer.current);
        disconnectSaveTimer.current = null;
      }
      return;
    }
    if (!wasConnectedRef.current || autoSavedRef.current) return;
    if (!peakDistRef.current || !peakElapsedRef.current) return;

    disconnectSaveTimer.current = setTimeout(
      () => endSession("disconnect"),
      DISCONNECT_SAVE_GRACE_MS,
    );
    return () => {
      if (disconnectSaveTimer.current) {
        clearTimeout(disconnectSaveTimer.current);
        disconnectSaveTimer.current = null;
      }
    };
  }, [ergConnected, endSession]);

  // Leaving the Live Erg screen mid-session ends it too — the accumulated
  // readings live in this component, so unmounting without saving loses them.
  useEffect(() => () => { endSession("stop"); }, [endSession]);

  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  const saveWorkout = async (d: Partial<LiveData>, pts: StrokePoint[]) => {
    // Prefer the session peaks over the last frame received — a disconnect or
    // reset frame can arrive with zeroed counters.
    const elapsedCs = Math.max(peakElapsedRef.current, d.elapsedTime ?? 0);
    const distanceM = Math.max(peakDistRef.current, d.distance ?? 0);
    if (!distanceM || !elapsedCs) return;

    try {
      const user = await getSessionUser();
      if (!user) return;

      const dist = Math.round(distanceM);

      // Averages over every reading taken during the session. Fall back to the
      // distance/time quotient if the PM5 sent no usable split frames.
      const avgSplitCs = mean(splitSamplesRef.current)
        ?? (elapsedCs > 0 && distanceM > 0 ? (elapsedCs / distanceM) * 500 : null);
      const minSplitCs = splitSamplesRef.current.length
        ? Math.min(...splitSamplesRef.current) : null;
      const avgWatts   = mean(wattSamplesRef.current);
      const maxWatts   = wattSamplesRef.current.length
        ? Math.max(...wattSamplesRef.current) : null;
      const avgSpm     = mean(spmSamplesRef.current);
      const avgHr      = mean(hrSamplesRef.current);
      const maxHr      = hrSamplesRef.current.length ? Math.max(...hrSamplesRef.current) : null;
      const minHr      = hrSamplesRef.current.length ? Math.min(...hrSamplesRef.current) : null;

      // Per user spec: the last 10 strokes' force curves go on the record.
      const lastTenCurves = allCurvesRef.current.slice(-10);

      // INTERVAL columns need a fully-qualified literal — Postgres reads a bare
      // "1:50" as 1 h 50 min, so csToInterval() is required, not fmtPace().
      const row: ErgWorkoutRow = {
        user_id:             user.id,
        workout_date:        localDateISO(),
        workout_type:        "live_erg",
        distance:            dist,
        elapsed_time:        Math.round(elapsedCs / 100),         // whole seconds
        duration:            csToInterval(elapsedCs),
        avg_split:           avgSplitCs != null ? csToInterval(Math.round(avgSplitCs)) : null,
        split_best:          minSplitCs != null ? csToInterval(minSplitCs) : null,
        avg_watts:           avgWatts != null ? Math.round(avgWatts) : null,
        max_watts:           maxWatts,
        stroke_rate_average: avgSpm != null ? Math.round(avgSpm) : null,
        stroke_rate:         avgSpm != null ? Math.round(avgSpm) : null,
        stroke_count:        allCurvesRef.current.length || d.strokeCount || null,
        avg_heart_rate:      avgHr != null ? Math.round(avgHr) : (hrBpm ?? null),
        heart_rate_average:  avgHr != null ? Math.round(avgHr) : null,
        heart_rate_max:      maxHr,
        heart_rate_min:      minHr,
        calories:            d.calories || null,
        force_curves:        lastTenCurves.length > 0 ? lastTenCurves : null,
        // HistorySection renders stroke_data.forceCurves — cap it so an hour-long
        // piece doesn't push a few hundred KB of JSONB into the row.
        stroke_data:         pts.length > 0
          ? { strokes: pts, forceCurves: allCurvesRef.current.slice(-60) }
          : null,
      };

      const saved = await insertErgWorkout(row);
      setSaved(true);

      toast({
        title: "Workout saved",
        description: "Analyzing performance…",
      });

      // Fire the AI analysis without blocking the rest of the save.
      void runAnalysis(saved?.id ?? null, row, user.id);

      // Save to erg_scores for leaderboard-eligible distances
      const BENCHMARK_DISTANCES: Record<number, string> = {
        2000: "2k", 5000: "5k", 6000: "6k", 10000: "10k",
      };
      const TOLERANCE = 15;
      const matchedDist = Object.keys(BENCHMARK_DISTANCES).find(
        bd => Math.abs(dist - parseInt(bd)) <= TOLERANCE
      );
      const is60min = Math.abs(elapsedCs / 100 - 3600) <= 30; // ±30s
      const testType = is60min
        ? "60min"
        : matchedDist ? BENCHMARK_DISTANCES[parseInt(matchedDist)] : null;

      if (testType) {
        const timeSeconds = elapsedCs / 100;
        const splitSecs = avgSplitCs != null ? avgSplitCs / 100 : null;
        const { data: profile } = await supabase
          .from("profiles")
          .select("weight_kg")
          .eq("id", user.id)
          .maybeSingle();
        const watts = avgWatts != null ? Math.round(avgWatts) : null;
        const wkg = watts && profile?.weight_kg
          ? watts / profile.weight_kg : null;
        await (supabase.from("erg_scores") as any).insert({
          user_id: user.id,
          test_type: testType,
          time_seconds: testType === "60min" ? null : Math.round(timeSeconds),
          total_meters: testType === "60min" ? dist : null,
          avg_split_seconds: splitSecs,
          watts,
          watts_per_kg: wkg,
          source: "live_erg",
          is_verified: true,
          to_leaderboard: true,
        });
      }
    } catch (e: any) {
      autoSavedRef.current = false; // let a retry (Stop / disconnect) through
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  /**
   * Insert into erg_workouts, degrading gracefully if this database hasn't run
   * every column migration yet: on an unknown-column error, drop that column
   * and retry rather than losing the whole session.
   */
  const insertErgWorkout = async (row: ErgWorkoutRow) => {
    const OPTIONAL_COLS = [
      "force_curves", "elapsed_time", "max_watts", "split_best",
      "stroke_rate_average", "stroke_rate", "stroke_count",
      "heart_rate_average", "heart_rate_max", "heart_rate_min", "stroke_data",
    ];
    const attempt: ErgWorkoutRow = { ...row };

    for (let i = 0; i <= OPTIONAL_COLS.length; i++) {
      const { data, error } = await (supabase.from("erg_workouts") as any)
        .insert(attempt).select("id").single();
      if (!error) return data as { id: string };

      const msg = String(error.message ?? error);
      const missing = OPTIONAL_COLS.find(c => c in attempt && new RegExp(`\\b${c}\\b`).test(msg));
      if (!missing) throw error;
      console.warn(`[LiveErg] erg_workouts.${missing} missing on this database — retrying without it`);
      delete attempt[missing];
    }
    throw new Error("Could not save workout — schema mismatch");
  };

  /**
   * FIX 2 — the analysis comes to the athlete. Nobody has to navigate anywhere:
   * the panel opens by itself as soon as analyze-workout answers.
   */
  const runAnalysis = async (
    workoutId: string | null,
    row: ErgWorkoutRow,
    userId: string,
  ) => {
    setAnalyzing(true);
    try {
      // analyze-workout stringifies the whole workout into the prompt, so send
      // the metrics only — the per-stroke arrays would be tens of thousands of
      // tokens of noise. Peak force per stroke carries the same signal.
      const { stroke_data: _sd, force_curves: curves, ...metrics } = row;
      const peakForces = Array.isArray(curves)
        ? (curves as number[][]).map(c => Math.max(...c))
        : undefined;

      const { data: fbData, error } = await invokeAI("analyze-workout", {
        body: {
          workoutType: "erg",
          // analyze-workout keys its permanent cache off workout.id, so the
          // saved row id is what makes this analysis stable and re-fetchable.
          workout: {
            ...metrics,
            source: "live_erg_bluetooth",
            recent_stroke_peak_forces_n: peakForces,
            id: workoutId,
            workout_id: workoutId,
          },
          user_id: userId,
        },
      });
      if (error) throw error;
      if (fbData?.feedback) {
        setFeedback(fbData.feedback as AIFeedback);
        setFeedbackOpen(true);          // slides up on its own — no navigation
        toast({ title: "Your AI analysis is ready" });
      } else {
        toast({ title: "Analysis unavailable", description: "Your workout was saved." });
      }
    } catch (e: any) {
      console.error("[LiveErg] analyze-workout failed:", e);
      toast({
        title: "Analysis unavailable",
        description: e?.message ? `Your workout was saved. ${e.message}` : "Your workout was saved.",
      });
    } finally {
      setAnalyzing(false);
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
        // Filter scan by HR service UUID
        const device = await BleClient.requestDevice({ services: [HR_SERVICE_UUID] });
        const deviceId = device.deviceId;
        hrNativeDeviceIdRef.current = deviceId;
        if (!Capacitor.isNativePlatform()) return;
        await BleClient.connect(deviceId, () => {
          setHrConnected(false);
          setHrBpm(null);
          toast({ title: "HR Monitor Disconnected" });
        });
        if (!Capacitor.isNativePlatform()) return;
        await BleClient.startNotifications(deviceId, HR_SERVICE_UUID, HR_CHAR_UUID, (value) => {
          const dv = toDataView(value);
          const hr = parseHRMeasurement(dv);
          if (hr !== null) {
            setHrBpm(hr);
            latestHr.current = hr;
          }
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
    setFeedback(null);
    setCurrentCurve([]);
    setPrevCurve([]);
    setAllCurves([]);
    setForceCurveSupported(null);
    wasConnectedRef.current = false;
    // Fresh session — clear the accumulated readings from the previous one.
    splitSamplesRef.current = [];
    wattSamplesRef.current  = [];
    spmSamplesRef.current   = [];
    hrSamplesRef.current    = [];
    peakElapsedRef.current  = 0;
    peakDistRef.current     = 0;
    setStrokes([]);
    await connectPM5();
  }, [btSupported, connectPM5]);

  // ── Stop button: end the session, save, analyse, then drop the link ─────────
  const stopSession = useCallback(() => {
    endSession("stop");
    disconnectPM5();
    wasConnectedRef.current = false;
  }, [endSession, disconnectPM5]);

  // ── Web-only: re-subscribe GATT characteristics on an existing server ────────
  const resubscribeErg = async (server: any) => {
    const svc = await server.getPrimaryService(C2_ROW_SVC);

    try {
      const gc = await svc.getCharacteristic(C2_GEN_STATUS);
      await gc.startNotifications();
      gc.addEventListener("characteristicvaluechanged", (e: any) => {
        const dv = e.target.value as DataView;
        accumulateStroke(parseCharacteristic(C2_GEN_STATUS, dv) as Partial<LiveData>);
      });
    } catch {}

    try {
      const ac = await svc.getCharacteristic(C2_ADD_STATUS);
      await ac.startNotifications();
      ac.addEventListener("characteristicvaluechanged", (e: any) => {
        const dv = e.target.value as DataView;
        accumulateStroke(parseCharacteristic(C2_ADD_STATUS, dv) as Partial<LiveData>);
      });
    } catch {}

    try {
      const a2c = await svc.getCharacteristic(C2_ADD_STATUS2);
      await a2c.startNotifications();
      a2c.addEventListener("characteristicvaluechanged", (e: any) => {
        const dv = e.target.value as DataView;
        accumulateStroke(parseCharacteristic(C2_ADD_STATUS2, dv) as Partial<LiveData>);
      });
    } catch {}

    // Force curve — try primary then fallback
    const subscribeFC = async (charUuid: string) => {
      try {
        const fcc = await svc.getCharacteristic(charUuid);
        await fcc.startNotifications();
        fcc.addEventListener("characteristicvaluechanged", (e: any) => {
          const dv = e.target.value as DataView;
          const parsed = parseCharacteristic(charUuid, dv);
          const forces = (parsed as any).forceCurve as number[] | undefined;
          if (forces && forces.length > 0) {
            setForceCurveSupported(true);
            setPrevCurve(currentCurveRef.current.length > 0 ? [...currentCurveRef.current] : []);
            setCurrentCurve(forces);
            setAllCurves(prev => [...prev, forces]);
          }
        });
        return true;
      } catch {
        return false;
      }
    };

    let ok = await subscribeFC(C2_FORCE_CURVE);
    if (!ok) ok = await subscribeFC(C2_FORCE_CURVE_FALLBACK);
    setForceCurveSupported(ok);
  };

  const disconnectErg = useCallback(() => {
    // A user-initiated disconnect ends the session too — a Bluetooth workout is
    // never lost for want of tapping Save.
    endSession("stop");
    wasConnectedRef.current = false;
    disconnectPM5();
  }, [endSession, disconnectPM5]);

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
    const sp = data.splitPace ?? 0;
    if (!sp || sp <= 0 || sp > 100000) return "--:--";
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
  // Something worth saving has been rowed this session.
  const hasSessionData = (data.distance ?? 0) > 0 && (data.elapsedTime ?? 0) > 0;

  // Y-axis tick formatter for the graph (split in centiseconds → m:ss)
  const fmtYTick = (v: number) => fmtPace(v);

  // Graph y-domain: auto with some padding, inverted (lower = faster = top)
  const splitValues = strokes.map(s => s.split).filter(Boolean);
  const minSplit = splitValues.length ? Math.min(...splitValues) - 500 : 6000;
  const maxSplit = splitValues.length ? Math.max(...splitValues) + 500 : 12000;

  // ── Force curve area chart data (per user spec) ──────────────────────────
  // X axis: sample index. Y axis: force from 0 N, 800 N floor (grows for bigger
  // strokes — recharts clamps out-of-domain samples). Line #2272FF, strokeWidth 2.
  const forceCurveAreaData = buildForceCurveAreaData(currentCurve);

  const statBlocks = [
    { label: "Split /500m",   value: fmtPace(data.splitPace ?? 0),                               big: true  },
    { label: "Stroke Rate",   value: fmtStrokeRate(data.strokeRate),                              big: false },
    { label: "Distance",      value: fmtDistance(data.distance),                                  big: false },
    { label: "Elapsed",       value: data.elapsedTime ? fmtTime(data.elapsedTime) : "--:--.0",     big: false },
    { label: "Calories",      value: data.calories   ? `${data.calories} cal` : "-- cal",          big: false },
    { label: "Power",         value: fmtWatts(data.power),                                        big: false },
    { label: "Heart Rate",    value: hr ? `${hr} bpm` : "-- bpm",                                  big: false },
    { label: "Drive Length",  value: data.driveLength ? fmtDriveLength(data.driveLength) : "--m",  big: false },
    { label: "Drive Time",    value: data.driveTime ? fmtDriveTime(data.driveTime) : "--",          big: false },
    { label: "Recovery Time", value: data.recoveryTime ? fmtDriveTime(data.recoveryTime) : "--",   big: false },
    { label: projLabel,       value: projValue,                                                     big: false },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col overflow-x-hidden">
      {/* ── AI analysis — slides up by itself once analyze-workout answers ── */}
      <Dialog open={feedbackOpen && !!feedback} onOpenChange={setFeedbackOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0 border-0 bg-transparent shadow-none">
          {feedback && (
            <WorkoutFeedback feedback={feedback} onDismiss={() => setFeedbackOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

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
            hasSessionData ? (
              <Button size="sm" variant="destructive" className="h-10 text-sm px-3 min-w-[44px]" onClick={stopSession}>
                <Square className="h-3.5 w-3.5 mr-1.5" /> Stop &amp; save
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white text-sm h-10 px-3 min-w-[44px]" onClick={disconnectErg}>
                Disconnect
              </Button>
            )
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
          <TimeInput
            value={targetInput}
            onChange={setTargetInput}
            className="h-7 bg-gray-800 border-gray-700 text-white"
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
          {/* Bluetooth sessions save themselves — this is status, not a control. */}
          {analyzing && (
            <span className="flex items-center gap-1.5 text-xs text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Analyzing performance…
            </span>
          )}
          {!analyzing && saved && feedback && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-400 hover:text-blue-300" onClick={() => setFeedbackOpen(true)}>
              <Sparkles className="h-3 w-3 mr-1" /> View AI analysis
            </Button>
          )}
          {!analyzing && saved && !feedback && (
            <span className="text-xs text-green-400">Saved automatically</span>
          )}
          {!saved && isFinished && (
            <span className="text-xs text-gray-500">Saving…</span>
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

      {/* ── Force Curve Area Chart (per user spec) ── */}
      <div className="px-4 pb-2">
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Force Curve</div>
        <div className="h-32 bg-gray-900 rounded-lg overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forceCurveAreaData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <YAxis domain={[0, forceCurveAxisMax]} hide />
              <XAxis dataKey="idx" hide />
              <Area
                type="monotone"
                dataKey="force"
                stroke="#2272FF"
                strokeWidth={2}
                fill="#2272FF"
                fillOpacity={0.2}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Force Curve (Canvas) — detailed view ── */}
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
      {forceCurveSupported === false && currentCurve.length === 0 && (
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
