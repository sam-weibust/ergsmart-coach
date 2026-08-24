import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import {
  initBle,
  toDataView,
  parseCharacteristic,
  parseHRMeasurement,
  subscribeForceCurve,
  isWebBluetoothSupported,
  HR_SERVICE,
  HR_MEASUREMENT,
} from "@/lib/ble";
import { forceCurveAxisMax } from "@/lib/forceCurve";
import { useBle } from "@/context/BleContext";
import {
  AreaChart, Area, XAxis, YAxis, ReferenceDot, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/TimeInput";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Bluetooth, Heart, Loader2, AlertTriangle, Square, ListPlus, Send, Minimize2, Maximize2,
} from "lucide-react";
import { getSessionUser } from "@/lib/getUser";
// Owned by other agents — imported, never created here.
import WorkoutBuilderModal from "./WorkoutBuilderModal";
import PostWorkoutScreen from "./PostWorkoutScreen";
import {
  fmtPace, fmtClock, parseSplitInput, csToInterval, localDateISO,
  projectedFinishSeconds, projectedDistanceMeters,
  driveEfficiencyScore, catchSlipRatio, CATCH_SLIP_THRESHOLD,
} from "@/lib/ergFormat";

// ── PM5 BLE UUIDs ─────────────────────────────────────────────
const C2_ROW_SVC      = "ce060030-43e5-11e4-916c-0800200c9a66";
const C2_GEN_STATUS   = "ce060031-43e5-11e4-916c-0800200c9a66"; // primary status
const C2_ADD_STATUS   = "ce060032-43e5-11e4-916c-0800200c9a66"; // power & calories
const C2_ADD_STATUS2  = "ce060033-43e5-11e4-916c-0800200c9a66"; // drive metrics

// ── Design tokens (whoop design system, dark live-erg surface) ─────────────
const INK      = "#000000"; // screen background
const NAVY     = "#1a1a2e"; // tile surface — the system navy
const BORDER   = "#4c4c4c";
const MUTED    = "#999999";
const WHITE    = "#ffffff";
const SUCCESS  = "#41ff31";
const DANGER   = "#ff0026";
const CURVE    = "#2272FF"; // force curve accent, per live-erg spec

// ── Types ──────────────────────────────────────────────────────
interface LiveData {
  elapsedTime: number;   // centiseconds
  distance: number;      // metres
  workoutState: number;  // 0=Idle 1=Countdown 2=Rowing 3=Paused 4=Finished
  strokeRate: number;    // spm
  heartRate: number;     // bpm (PM5-relayed)
  calories: number;
  splitPace: number;     // centiseconds per 500 m
  power: number;         // watts
  driveLength: number;   // centimetres (0.01m units from 0x0033)
  driveTime: number;     // centiseconds (0.01s from 0x0033)
  recoveryTime: number;  // centiseconds (0.01s from 0x0033)
  strokeCount: number;   // accumulated strokes
  averagePace: number;   // centiseconds per 500 m (PM5's own average)
}

interface StrokePoint {
  dist: number;    // metres
  split: number;   // centiseconds / 500 m (lower = faster)
  spm: number;
  hr: number;
  watts: number;
  t: number;       // seconds since the start of the piece
}

// Formatters live in src/lib/ergFormat.ts so they can be unit-tested against
// known PM5 byte payloads (npm run test:pm5).

// Grace period before a dropped PM5 connection counts as the end of the
// session — BleContext retries the connection at 2 s, so give it room to win.
const DISCONNECT_SAVE_GRACE_MS = 8000;

// Watts SAMPLING gate. The PM5 emits a genuine reading for a light warm-up
// stroke (30–50 W) and a genuine reading for a garbled/idle frame (0 W, or a
// four-digit value when two bytes get misaligned). Anything below 50 W or above
// 1500 W is excluded from the avg/max ***aggregation*** only — the live tile
// always shows the raw number the erg sent, so a real 40 W stroke is never
// blanked on screen.
const WATTS_SAMPLE_MIN = 50;
const WATTS_SAMPLE_MAX = 1500;

/**
 * The erg_workouts row an auto-saved live session writes. Loosely typed on
 * purpose: insertErgWorkout() deletes keys the database hasn't migrated yet.
 */
type ErgWorkoutRow = Record<string, string | number | object | null | undefined>;

/** Payload handed to PostWorkoutScreen once the row is in the database. */
interface PostWorkoutPayload {
  workoutId: string | null;
  row: ErgWorkoutRow;
  strokes: { split: number | null; watts: number | null; hr: number | null; t: number }[];
  forceCurves: number[][];
  userId: string;
}

const STATE_LABELS = ["Idle", "Countdown", "Rowing", "Paused", "Finished", "--"];

interface LiveErgViewProps {
  /** A coach-assigned / builder-built workout to load onto the PM5. */
  coachWorkout?: any;
}

// ── Component ──────────────────────────────────────────────────
export default function LiveErgView(props: LiveErgViewProps) {
  // Native gets full BLE. Desktop web gets the same screen over Web Bluetooth
  // (Chrome/Edge). Mobile web browsers have no BLE at all.
  const usable = Capacitor.isNativePlatform() || isWebBluetoothSupported();
  if (!usable) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center p-8">
          <Bluetooth className="h-12 w-12 mx-auto mb-4" style={{ color: CURVE }} />
          <p className="text-lg font-semibold mb-2">Connect via the iOS app for live erg tracking</p>
          <p className="text-sm text-muted-foreground">
            Live BLE connection to your PM5 requires the native iOS app, or Chrome/Edge on desktop.
          </p>
        </div>
      </div>
    );
  }
  return <LiveErgViewNative {...props} />;
}

// ── Metric tile ────────────────────────────────────────────────
function Tile({
  label, value, unit, color,
}: { label: string; value: string; unit: string; color?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center overflow-hidden rounded-md border px-2 py-2 min-h-0"
      style={{ background: NAVY, borderColor: BORDER }}
    >
      <span
        className="uppercase leading-none tracking-widest text-center"
        style={{ fontSize: 11, color: MUTED }}
      >
        {label}
      </span>
      <span
        className="font-bold tabular-nums leading-none text-center"
        style={{ fontSize: 36, color: color ?? WHITE, marginTop: 8, marginBottom: 4 }}
      >
        {value}
      </span>
      <span className="leading-none" style={{ fontSize: 12, color: MUTED }}>{unit}</span>
    </div>
  );
}

function StatusDot({ on, warn }: { on: boolean; warn?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full ${on || warn ? "animate-pulse" : ""}`}
      style={{ width: 8, height: 8, background: on ? SUCCESS : warn ? "#f59e0b" : MUTED }}
    />
  );
}

function LiveErgViewNative({ coachWorkout }: LiveErgViewProps) {
  const { toast } = useToast();

  const { ergDeviceId, ergConnected, ergConnecting, webErgDevice, connectPM5, disconnectPM5 } = useBle();

  const [btSupported, setBtSupported] = useState(true);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setBtSupported(isWebBluetoothSupported());
      return;
    }
    // Route through initBle() so BleClient.initialize runs at most once (isInitialized guard).
    initBle()
      .then((status) => { if (status !== "ready") setBtSupported(false); })
      .catch((err) => {
        console.error("[LiveErgView] initBle() failed:", err);
        setBtSupported(false);
      });
  }, []);

  // Full-screen landscape by default; collapsing puts the dashboard chrome
  // back within reach (and releases the orientation lock).
  const [immersive, setImmersive] = useState(true);

  // ── Landscape lock ───────────────────────────────────────────
  // Native only. Locks landscape while the immersive view is up and restores
  // portrait on EVERY exit path — collapsing, normal unmount, unmount while a
  // save is in flight, or an error that unmounts the tree — because the effect
  // cleanup performs the restore and React runs it unconditionally. A lock that
  // resolves after the component is gone restores again, so a slow lock can't
  // strand the app sideways.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;   // web: CSS-only, no orientation API
    if (!immersive) return;
    let disposed = false;

    const restorePortrait = () =>
      ScreenOrientation.lock({ orientation: "portrait" })
        .catch(err => console.warn("[LiveErg] portrait restore failed:", err))
        // Hand orientation control back to the OS once the device has settled,
        // otherwise every screen after this one stays pinned to portrait.
        .then(() => new Promise<void>(r => setTimeout(r, 300)))
        .then(() => ScreenOrientation.unlock().catch(() => {}));

    ScreenOrientation.lock({ orientation: "landscape" })
      .then(() => { if (disposed) void restorePortrait(); })
      .catch(err => console.warn("[LiveErg] landscape lock failed:", err));

    return () => {
      disposed = true;
      void restorePortrait();
    };
  }, [immersive]);

  const [hrConnected,  setHrConnected]  = useState(false);
  const [hrConnecting, setHrConnecting] = useState(false);
  const [disconnected, setDisconnected] = useState(false); // mid-workout disconnect
  const wasConnectedRef = useRef(false);

  const [data,  setData]  = useState<Partial<LiveData>>({});
  const [hrBpm, setHrBpm] = useState<number | null>(null); // strap only
  const [saved, setSaved] = useState(false);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [postOpen,    setPostOpen]    = useState(false);
  const [postPayload, setPostPayload] = useState<PostWorkoutPayload | null>(null);

  // Three most recent force curves, kept together so they can never fall out of
  // step with each other (current, previous, the one before that).
  const [curves, setCurves] = useState<{ cur: number[]; p1: number[]; p2: number[] }>(
    { cur: [], p1: [], p2: [] },
  );
  const [strokeCurveCount,    setStrokeCurveCount]    = useState(0);
  const [forceCurveSupported, setForceCurveSupported] = useState<boolean | null>(null);
  const [forceCurveUuid,      setForceCurveUuid]      = useState<string | null>(null);

  const [targetInput,     setTargetInput]     = useState("");
  const [targetCs,        setTargetCs]        = useState<number | null>(null); // centiseconds
  const [targetDistInput, setTargetDistInput] = useState("");
  const [targetDist,      setTargetDist]      = useState<number | null>(null); // metres

  const hrDeviceRef         = useRef<any>(null);
  const hrNativeDeviceIdRef = useRef<string | null>(null);
  // Strap BPM in a ref so accumulateStroke (a stable callback) can read it.
  const hrBpmRef            = useRef<number | null>(null);
  const prevStateRef  = useRef<number | undefined>(undefined);
  const autoSavedRef  = useRef(false);
  const strokesRef    = useRef<StrokePoint[]>([]);       // per-stroke samples for save + post-workout
  const dataRef       = useRef<Partial<LiveData>>({});   // keep in sync for save
  const curCurveRef   = useRef<number[]>([]);
  const allCurvesRef  = useRef<number[][]>([]);

  // Every reading taken during the session — averages/extremes are computed from
  // these on save, not from the last frame the PM5 happened to send.
  const splitSamplesRef = useRef<number[]>([]);   // centiseconds / 500 m
  const wattSamplesRef  = useRef<number[]>([]);   // watts (gated 50–1500)
  const spmSamplesRef   = useRef<number[]>([]);   // strokes / minute
  const hrSamplesRef    = useRef<number[]>([]);   // bpm
  // Running split total so the live "Avg Split" tile costs O(1) per frame.
  const splitSumRef     = useRef(0);
  const splitCountRef   = useRef(0);
  // Peak elapsed time / distance seen, so a disconnect frame of zeros can't
  // shrink the saved workout.
  const peakElapsedRef  = useRef(0);
  const peakDistRef     = useRef(0);
  const disconnectSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { dataRef.current = data; }, [data]);

  // Track mid-workout disconnect via context ergConnected
  useEffect(() => {
    if (ergConnected) {
      wasConnectedRef.current = true;
      setDisconnected(false);
    } else if (wasConnectedRef.current) {
      setDisconnected(true);
    }
  }, [ergConnected]);

  // ── Force curve intake (shared by native + web) ──────────────
  const onForceCurve = useCallback((forces: number[]) => {
    setForceCurveSupported(true);
    setCurves(prev => ({ cur: forces, p1: prev.cur, p2: prev.p1 }));
    curCurveRef.current = forces;
    allCurvesRef.current = [...allCurvesRef.current, forces];
    setStrokeCurveCount(allCurvesRef.current.length);
  }, []);

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

        // ce060393 is unproven on this hardware, so both it and the legacy
        // ce060035 are subscribed and whichever actually delivers samples wins.
        const subscribed = await subscribeForceCurve({
          deviceId: ergDeviceId,
          isCancelled: () => cancelled,
          onCurve: (forces) => onForceCurve(forces),
          onWinner: (uuid) => setForceCurveUuid(uuid),
        });
        if (!cancelled) setForceCurveSupported(subscribed.length > 0 ? null : false);
      } else if (!isNative && webErgDevice?.gatt?.connected) {
        await resubscribeErg(webErgDevice.gatt, () => cancelled);
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
  const latestWatts = useRef(0);

  const accumulateStroke = useCallback((d: Partial<LiveData>) => {
    if (d.distance   !== undefined) latestDist.current  = d.distance;
    if (d.splitPace  !== undefined) latestSplit.current = d.splitPace;
    if (d.strokeRate !== undefined) latestSpm.current   = d.strokeRate;
    if (d.power      !== undefined) latestWatts.current = d.power;
    if (d.heartRate  !== undefined && d.heartRate > 0) latestHr.current = d.heartRate;

    // Session-long sample collection for the auto-save averages. Bounds mirror
    // the sanity ranges in ble.ts so an idle or garbled frame can't skew a mean.
    if (d.splitPace && d.splitPace >= 6000 && d.splitPace <= 30000) {
      splitSamplesRef.current.push(d.splitPace);
      splitSumRef.current   += d.splitPace;
      splitCountRef.current += 1;
    }
    // Aggregation gate only — the Watts tile still shows d.power verbatim.
    if (d.power      && d.power >= WATTS_SAMPLE_MIN && d.power <= WATTS_SAMPLE_MAX) wattSamplesRef.current.push(d.power);
    if (d.strokeRate && d.strokeRate > 0 && d.strokeRate <= 60)  spmSamplesRef.current.push(d.strokeRate);
    if (d.heartRate  && d.heartRate >= 40 && d.heartRate <= 220) hrSamplesRef.current.push(d.heartRate);
    if (d.elapsedTime && d.elapsedTime > peakElapsedRef.current) peakElapsedRef.current = d.elapsedTime;
    if (d.distance    && d.distance    > peakDistRef.current)    peakDistRef.current    = d.distance;

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
          hr:    hrBpmRef.current ?? latestHr.current,
          watts: latestWatts.current,
          // Seconds into the piece — PostWorkoutScreen plots against this.
          t:     Math.round((peakElapsedRef.current ?? 0) / 100),
        };
        const arr = strokesRef.current;
        // Deduplicate: only push if distance changed meaningfully
        if (!(arr.length > 0 && arr[arr.length - 1].dist === point.dist)) {
          strokesRef.current = [...arr, point];
        }
      }
      return next;
    });
  }, []);

  useEffect(() => { hrBpmRef.current = hrBpm; }, [hrBpm]);

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
        avg_heart_rate:      avgHr != null ? Math.round(avgHr) : (hrBpmRef.current ?? null),
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

      const savedRow = await insertErgWorkout(row);
      setSaved(true);

      // The analysis now belongs to PostWorkoutScreen — this view hands over the
      // saved row, the per-stroke samples and the curves, and gets out of the way.
      setPostPayload({
        workoutId:   savedRow?.id ?? null,
        row,
        strokes:     pts.map(p => ({
          split: p.split > 0 ? p.split : null,
          watts: p.watts > 0 ? p.watts : null,
          hr:    p.hr    > 0 ? p.hr    : null,
          t:     p.t,
        })),
        forceCurves: allCurvesRef.current.slice(-60),
        userId:      user.id,
      });
      setPostOpen(true);

      toast({ title: "Workout saved" });

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

      // Verified leaderboard scores are no longer written straight to
      // erg_scores: the table now rejects is_verified = true from the client,
      // because that policy was `auth.uid() IS NOT NULL` and let anyone post a
      // fabricated world record. submit_verified_erg_score derives the numbers
      // server-side from the erg_workouts row just saved, so a verified score
      // can only come from a session that actually exists and belongs to us.
      if (testType && savedRow?.id) {
        const { error: scoreErr } = await (supabase as any).rpc("submit_verified_erg_score", {
          p_workout_id: savedRow.id,
          p_test_type: testType,
        });
        // The session itself is already saved — a leaderboard failure should not
        // read as a lost workout.
        if (scoreErr) console.error("[LiveErg] verified score submit failed:", scoreErr.message);
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

  // ── BT: connect heart-rate strap (0x180D only) ───────────────
  const connectHR = useCallback(async () => {
    if (!btSupported || hrConnecting) return;
    setHrConnecting(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native: scan filtered to the Heart Rate service — nothing else appears.
        const device = await BleClient.requestDevice({ services: [HR_SERVICE] });
        const deviceId = device.deviceId;
        hrNativeDeviceIdRef.current = deviceId;
        if (!Capacitor.isNativePlatform()) return;
        await BleClient.connect(deviceId, () => {
          setHrConnected(false);
          setHrBpm(null);
          toast({ title: "HR Monitor Disconnected" });
        });
        if (!Capacitor.isNativePlatform()) return;
        await BleClient.startNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
          const dv = toDataView(value);
          const hr = parseHRMeasurement(dv);
          if (hr !== null && hr >= 40 && hr <= 220) {
            setHrBpm(hr);
            hrBpmRef.current = hr;
            latestHr.current = hr;
            hrSamplesRef.current.push(hr);
          }
        });
        setHrConnected(true);
        toast({ title: "HR Connected", description: device.name || "Heart Rate Monitor" });
      } else {
        // Web Bluetooth — same 0x180D-only filter.
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [{ services: [HR_SERVICE] }],
        });
        const connectAndSubscribe = async () => {
          const server  = await device.gatt!.connect();
          const service = await server.getPrimaryService(HR_SERVICE);
          const char    = await service.getCharacteristic(HR_MEASUREMENT);
          await char.startNotifications();
          char.addEventListener("characteristicvaluechanged", (e: any) => {
            const hr = parseHRMeasurement(e.target.value as DataView);
            if (hr !== null && hr >= 40 && hr <= 220) {
              setHrBpm(hr);
              hrBpmRef.current = hr;
              latestHr.current = hr;
              hrSamplesRef.current.push(hr);
            }
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
      if (e?.name !== "NotFoundError") {
        toast({ title: "HR Connect Failed", description: e?.message, variant: "destructive" });
      }
    } finally {
      setHrConnecting(false);
    }
  }, [btSupported, hrConnecting, toast]);

  // ── BT: connect Erg (via BleContext for cross-page persistence) ─────────────
  const connectErg = useCallback(async () => {
    if (!btSupported) return;
    autoSavedRef.current = false;
    prevStateRef.current = undefined;
    setSaved(false);
    setCurves({ cur: [], p1: [], p2: [] });
    setStrokeCurveCount(0);
    setForceCurveSupported(null);
    setForceCurveUuid(null);
    wasConnectedRef.current = false;
    // Fresh session — clear the accumulated readings from the previous one.
    splitSamplesRef.current = [];
    wattSamplesRef.current  = [];
    spmSamplesRef.current   = [];
    hrSamplesRef.current    = [];
    splitSumRef.current     = 0;
    splitCountRef.current   = 0;
    peakElapsedRef.current  = 0;
    peakDistRef.current     = 0;
    curCurveRef.current     = [];
    allCurvesRef.current    = [];
    strokesRef.current      = [];
    setData({});
    await connectPM5();
  }, [btSupported, connectPM5]);

  // ── Stop button: end the session, save, then drop the link ─────────
  const stopSession = useCallback(() => {
    endSession("stop");
    disconnectPM5();
    wasConnectedRef.current = false;
  }, [endSession, disconnectPM5]);

  // ── Web-only: re-subscribe GATT characteristics on an existing server ────────
  const resubscribeErg = async (server: any, isCancelled: () => boolean) => {
    const svc = await server.getPrimaryService(C2_ROW_SVC);

    const attach = async (charUuid: string) => {
      try {
        const c = await svc.getCharacteristic(charUuid);
        await c.startNotifications();
        c.addEventListener("characteristicvaluechanged", (e: any) => {
          if (isCancelled()) return;
          const dv = e.target.value as DataView;
          accumulateStroke(parseCharacteristic(charUuid, dv) as Partial<LiveData>);
        });
      } catch {}
    };

    await attach(C2_GEN_STATUS);
    await attach(C2_ADD_STATUS);
    await attach(C2_ADD_STATUS2);

    const subscribed = await subscribeForceCurve({
      gattServer: server,
      isCancelled,
      onCurve: (forces) => onForceCurve(forces),
      onWinner: (uuid) => setForceCurveUuid(uuid),
    });
    setForceCurveSupported(subscribed.length > 0 ? null : false);
  };

  const disconnectErg = useCallback(() => {
    // A user-initiated disconnect ends the session too — a Bluetooth workout is
    // never lost for want of tapping Save.
    endSession("stop");
    wasConnectedRef.current = false;
    disconnectPM5();
  }, [endSession, disconnectPM5]);

  // ── Targets ──────────────────────────────────────────────────
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

  // A loaded workout can carry its own target, under any of the names the
  // builder / coach tables use. Everything is coerced and range-checked.
  const loadedTargets = useMemo(() => {
    const w: any = coachWorkout;
    const num = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    if (!w) return { dist: null as number | null, seconds: null as number | null };
    return {
      dist:    num(w.target_distance ?? w.target_distance_m ?? w.distance ?? w.meters),
      seconds: num(w.target_time_seconds ?? w.duration_seconds ?? w.time_seconds ?? w.target_seconds),
    };
  }, [coachWorkout]);

  const effTargetDist    = targetDist ?? loadedTargets.dist;
  const effTargetSeconds = loadedTargets.seconds;

  // ── Derived display values ────────────────────────────────────
  const state      = data.workoutState ?? 0;
  const isFinished = state === 4;
  const elapsedCs  = data.elapsedTime ?? 0;
  const distM      = data.distance ?? 0;
  const splitCs    = data.splitPace ?? 0;

  // Strap over PM5: a chest strap talks to us directly, the PM5 figure is a
  // relayed (and often stale) copy of the same signal.
  const strapLive  = hrConnected && hrBpm != null && hrBpm > 0;
  const pm5Hr      = data.heartRate && data.heartRate > 0 ? data.heartRate : null;
  const hr         = strapLive ? hrBpm : pm5Hr;
  const hrSource   = strapLive ? "STRAP" : pm5Hr ? "PM5" : "BPM";

  // Session average split, O(1) from the running total.
  const avgSplitCsLive = splitCountRef.current > 0
    ? splitSumRef.current / splitCountRef.current
    : (data.averagePace ?? 0);

  // Projected finish. Distance target → a time; time target → a distance;
  // no target at all → the classic projected 2 000 m. Every branch returns
  // "—" rather than Infinity/NaN while elapsed ≈ 0 or the split is still 0.
  const projection = (() => {
    if (effTargetSeconds != null) {
      const m = projectedDistanceMeters(effTargetSeconds, distM, elapsedCs);
      return { label: "Projected", value: m == null ? "—" : String(Math.round(m)), unit: "m" };
    }
    const target = effTargetDist ?? 2000;
    const secs = projectedFinishSeconds(target, distM, splitCs, elapsedCs);
    return {
      label: "Projected",
      value: secs == null ? "—" : fmtClock(secs),
      unit: `${target}m finish`,
    };
  })();

  // Progress toward the loaded target (distance or time). Hidden without one.
  const progress = (() => {
    if (effTargetDist != null && effTargetDist > 0) {
      return Math.max(0, Math.min(1, distM / effTargetDist));
    }
    if (effTargetSeconds != null && effTargetSeconds > 0) {
      return Math.max(0, Math.min(1, (elapsedCs / 100) / effTargetSeconds));
    }
    return null;
  })();

  // ── Force curve chart ────────────────────────────────────────
  const { cur, p1, p2 } = curves;
  const curveData = useMemo(() => {
    const len = Math.max(cur.length, p1.length, p2.length, 20);
    return Array.from({ length: len }, (_, i) => ({
      idx: i,
      cur: i < cur.length ? cur[i] : null,
      p1:  i < p1.length  ? p1[i]  : null,
      p2:  i < p2.length  ? p2[i]  : null,
    }));
  }, [cur, p1, p2]);

  const peak = cur.length ? Math.max(...cur) : 0;
  const peakIdx = cur.length ? cur.indexOf(peak) : 0;
  const axisMax = forceCurveAxisMax(Math.max(
    peak,
    p1.length ? Math.max(...p1) : 0,
    p2.length ? Math.max(...p2) : 0,
  ));

  const efficiency = driveEfficiencyScore(cur);
  const slipRatio  = catchSlipRatio(cur);
  const slipping   = slipRatio != null && slipRatio > CATCH_SLIP_THRESHOLD;

  const hasSessionData = distM > 0 && elapsedCs > 0;
  const canBuild = !ergConnected || !hasSessionData;

  const splitColor = targetCs && splitCs > 0
    ? (splitCs <= targetCs ? SUCCESS : DANGER)
    : WHITE;

  return (
    // Landscape shell. Fixed + overflow-hidden: everything is on screen at once,
    // nothing scrolls. On web the same flex row simply follows the viewport, so
    // a wide browser window gets the identical layout with no orientation API.
    <div
      className={
        immersive
          ? "fixed inset-0 z-50 flex flex-col overflow-hidden"
          : "relative w-full flex flex-col overflow-hidden rounded-md border"
      }
      style={{
        background: INK,
        color: WHITE,
        fontFamily: "var(--font-body)",
        borderColor: immersive ? undefined : BORDER,
        height: immersive ? undefined : "80vh",
      }}
    >
      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between gap-2 px-3 border-b shrink-0"
        style={{ borderColor: BORDER, height: 44 }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <span className="flex items-center gap-2">
            <StatusDot on={ergConnected} warn={disconnected} />
            <span className="uppercase tracking-widest" style={{ fontSize: 11, color: MUTED }}>
              {ergConnected ? `PM5 ${STATE_LABELS[state] ?? "--"}` : disconnected ? "Reconnecting" : "PM5 offline"}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <StatusDot on={hrConnected} />
            <span className="uppercase tracking-widest" style={{ fontSize: 11, color: MUTED }}>
              {hrConnected ? "Strap" : "No strap"}
            </span>
          </span>
          {forceCurveUuid && (
            <span className="hidden md:inline uppercase tracking-widest" style={{ fontSize: 11, color: MUTED }}>
              FC {forceCurveUuid.slice(0, 8)}
            </span>
          )}
          {saved && (
            <span className="uppercase tracking-widest" style={{ fontSize: 11, color: SUCCESS }}>Saved</span>
          )}
          {!saved && isFinished && (
            <span className="uppercase tracking-widest" style={{ fontSize: 11, color: MUTED }}>Saving…</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Send to PM5 is available whenever there is an erg to send to —
              with a coach-assigned workout loaded it pushes that piece, and
              otherwise it opens the builder on the same programming screen. */}
          {(coachWorkout || ergConnected) && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              style={{ fontSize: 12, background: "transparent", borderColor: BORDER, color: WHITE }}
              onClick={() => setBuilderOpen(true)}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" /> Send to PM5
            </Button>
          )}
          {canBuild && !ergConnected && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              style={{ fontSize: 12, background: "transparent", borderColor: BORDER, color: WHITE }}
              onClick={() => setBuilderOpen(true)}
            >
              <ListPlus className="h-3.5 w-3.5 mr-1.5" /> Build Workout
            </Button>
          )}
          {!hrConnected && btSupported && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              style={{ fontSize: 12, background: "transparent", borderColor: BORDER, color: WHITE }}
              onClick={connectHR}
              disabled={hrConnecting}
            >
              {hrConnecting
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Heart className="h-3.5 w-3.5 mr-1.5" />}
              Connect Heart Rate Monitor
            </Button>
          )}
          {ergConnected ? (
            hasSessionData ? (
              <Button size="sm" variant="destructive" className="h-8 px-3" style={{ fontSize: 12 }} onClick={stopSession}>
                <Square className="h-3.5 w-3.5 mr-1.5" /> Stop &amp; save
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3"
                style={{ fontSize: 12, background: "transparent", borderColor: BORDER, color: MUTED }}
                onClick={disconnectErg}
              >
                Disconnect
              </Button>
            )
          ) : (
            <Button
              size="sm"
              className="h-8 px-3"
              style={{ fontSize: 12, background: CURVE, color: WHITE }}
              onClick={connectErg}
              disabled={ergConnecting || !btSupported}
            >
              {ergConnecting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Connecting…</>
                : <><Bluetooth className="h-3.5 w-3.5 mr-1.5" />Connect PM5</>}
            </Button>
          )}
          {/* Collapsing releases the landscape lock and hands the dashboard
              navigation back — the immersive view covers it completely. */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            style={{ background: "transparent", borderColor: BORDER, color: MUTED }}
            onClick={() => setImmersive(v => !v)}
            aria-label={immersive ? "Exit full screen" : "Full screen"}
          >
            {immersive ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* ── Pre-session setup strip (targets). Gone once the piece is running. ── */}
      {canBuild && (
        <div
          className="flex items-center gap-2 px-3 border-b shrink-0"
          style={{ borderColor: BORDER, height: 40 }}
        >
          <span className="uppercase tracking-widest" style={{ fontSize: 11, color: MUTED }}>Target split</span>
          <TimeInput
            value={targetInput}
            onChange={setTargetInput}
            className="h-8"
          />
          <Button
            size="sm" variant="outline" className="h-7 px-2"
            style={{ fontSize: 11, background: "transparent", borderColor: BORDER, color: WHITE }}
            onClick={applyTarget}
          >Set</Button>
          {targetCs && (
            <span className="tabular-nums" style={{ fontSize: 12, color: SUCCESS }}>{fmtPace(targetCs)}/500m</span>
          )}
          <span style={{ color: BORDER }}>|</span>
          <span className="uppercase tracking-widest" style={{ fontSize: 11, color: MUTED }}>Target distance</span>
          <Input
            value={targetDistInput}
            onChange={e => setTargetDistInput(e.target.value)}
            placeholder="2000"
            className="h-7 w-20 tabular-nums"
            style={{ fontSize: 12 }}
          />
          <Button
            size="sm" variant="outline" className="h-7 px-2"
            style={{ fontSize: 11, background: "transparent", borderColor: BORDER, color: WHITE }}
            onClick={applyTargetDist}
          >Set</Button>
          {effTargetDist && (
            <span className="tabular-nums" style={{ fontSize: 12, color: CURVE }}>{effTargetDist}m</span>
          )}
          {disconnected && (
            <span className="ml-auto flex items-center gap-2" style={{ fontSize: 12, color: "#f59e0b" }}>
              <AlertTriangle className="h-3.5 w-3.5" /> Connection lost — data preserved, reconnecting…
            </span>
          )}
        </div>
      )}

      {/* ── Landscape body: 40% force curve · 60% metrics ── */}
      <div className="flex-1 min-h-0 flex gap-2 p-2">
        {/* LEFT — force curve */}
        <div
          className="flex flex-col min-h-0 rounded-md border p-2"
          style={{ width: "40%", background: NAVY, borderColor: BORDER }}
        >
          <div className="flex items-center justify-between shrink-0" style={{ marginBottom: 4 }}>
            <span className="uppercase tracking-widest" style={{ fontSize: 11, color: MUTED }}>Force curve</span>
            <span className="tabular-nums" style={{ fontSize: 11, color: MUTED }}>
              {strokeCurveCount ? `${strokeCurveCount} strokes` : "waiting"}
            </span>
          </div>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curveData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                <XAxis dataKey="idx" type="number" domain={[0, "dataMax"]} hide />
                <YAxis
                  domain={[0, axisMax]}
                  width={36}
                  tick={{ fill: MUTED, fontSize: 10 }}
                  axisLine={{ stroke: BORDER }}
                  tickLine={false}
                />
                {/* Two strokes ago — faintest */}
                <Area
                  type="monotone" dataKey="p2" stroke={CURVE} strokeOpacity={0.2}
                  fill={CURVE} fillOpacity={0.05} strokeWidth={2}
                  dot={false} isAnimationActive={false} connectNulls={false}
                />
                {/* Previous stroke */}
                <Area
                  type="monotone" dataKey="p1" stroke={CURVE} strokeOpacity={0.4}
                  fill={CURVE} fillOpacity={0.1} strokeWidth={2}
                  dot={false} isAnimationActive={false} connectNulls={false}
                />
                {/* Current stroke — solid */}
                <Area
                  type="monotone" dataKey="cur" stroke={CURVE}
                  fill={CURVE} fillOpacity={0.22} strokeWidth={2}
                  dot={false} isAnimationActive={false} connectNulls={false}
                />
                {peak > 0 && (
                  <ReferenceDot
                    x={peakIdx} y={peak} r={3} fill={CURVE} stroke="none"
                    isFront
                    label={{ value: `${Math.round(peak)} N`, position: "top", fill: WHITE, fontSize: 12 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Drive quality read-outs */}
          <div className="flex items-center justify-between shrink-0" style={{ marginTop: 4 }}>
            <span className="flex items-baseline gap-2">
              <span className="uppercase tracking-widest" style={{ fontSize: 11, color: MUTED }}>Drive efficiency</span>
              <span className="font-bold tabular-nums" style={{ fontSize: 20, color: WHITE }}>
                {efficiency == null ? "—" : efficiency}
              </span>
              <span style={{ fontSize: 11, color: MUTED }}>/100</span>
            </span>
            <span
              className="uppercase tracking-widest rounded-sm px-2 py-1"
              style={{
                fontSize: 11,
                color: slipRatio == null ? MUTED : slipping ? DANGER : SUCCESS,
                border: `1px solid ${BORDER}`,
              }}
            >
              {slipRatio == null ? "Catch —" : slipping ? "Catch slip" : "Clean catch"}
            </span>
          </div>

          {forceCurveSupported === false && (
            <p className="text-center shrink-0" style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
              Force curve not available on this PM5 firmware.
            </p>
          )}
        </div>

        {/* RIGHT — 3×3 metric grid */}
        <div className="flex flex-col min-h-0 gap-2" style={{ width: "60%" }}>
          <div className="grid flex-1 min-h-0 gap-2" style={{ gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(3, 1fr)" }}>
            {/* Row 1 */}
            <Tile label="Split"       value={fmtPace(splitCs)}                                    unit="/500m" color={splitColor} />
            <Tile label="Watts"       value={data.power ? String(Math.round(data.power)) : "—"}   unit="W" />
            <Tile label="Stroke rate" value={(data.strokeRate && data.strokeRate > 3) ? String(Math.round(data.strokeRate)) : "—"} unit="spm" />
            {/* Row 2 */}
            <Tile label="Distance"    value={distM > 0 ? distM.toFixed(1) : "—"}                  unit="m" />
            <Tile label="Elapsed"     value={elapsedCs > 0 ? fmtClock(elapsedCs / 100) : "—"}     unit="mm:ss" />
            <Tile label="Heart rate"  value={hr ? String(Math.round(hr)) : "—"}                   unit={hrSource} />
            {/* Row 3 */}
            <Tile label="Avg split"   value={fmtPace(avgSplitCsLive)}                             unit="/500m" />
            <Tile label={projection.label} value={projection.value}                               unit={projection.unit} />
            <Tile label="Calories"    value={data.calories ? String(Math.round(data.calories)) : "—"} unit="cal" />
          </div>

          {/* Progress toward the target — 4px, hidden when there is no target */}
          {progress != null && (
            <div className="shrink-0 w-full overflow-hidden rounded-sm" style={{ height: 4, background: NAVY }}>
              <div style={{ height: 4, width: `${progress * 100}%`, background: CURVE, transition: "width 300ms cubic-bezier(.4,0,.2,1)" }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bluetooth unavailable ── */}
      {!btSupported && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.95)" }}>
          <div className="text-center p-8">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4" style={{ color: "#f59e0b" }} />
            <p className="text-lg font-semibold mb-2">Bluetooth unavailable</p>
            <p style={{ fontSize: 14, color: MUTED }}>
              Use Chrome or Edge on desktop, or the CrewSync iOS app, to connect your PM5.
            </p>
          </div>
        </div>
      )}

      {/* ── Workout builder (owned by another module) ── */}
      <WorkoutBuilderModal
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        deviceId={ergDeviceId ?? null}
        coachWorkout={coachWorkout}
      />

      {/* ── Post-workout: owns the analyze-workout call now ── */}
      {postPayload && (
        <PostWorkoutScreen
          open={postOpen}
          onOpenChange={setPostOpen}
          workoutId={postPayload.workoutId}
          row={postPayload.row}
          strokes={postPayload.strokes}
          forceCurves={postPayload.forceCurves}
          userId={postPayload.userId}
        />
      )}
    </div>
  );
}
