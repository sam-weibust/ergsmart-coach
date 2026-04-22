import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

// ── PM5 BLE UUIDs ─────────────────────────────────────────────
const C2_SERVICE      = "ce060000-43e5-11e4-916c-0800200c9a66";
const C2_ROW_SVC      = "ce060030-43e5-11e4-916c-0800200c9a66";
const C2_GEN_STATUS   = "ce060031-43e5-11e4-916c-0800200c9a66";
const C2_ADD_STATUS   = "ce060032-43e5-11e4-916c-0800200c9a66";
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
  driveLength: number;   // cm
  driveTime: number;     // centiseconds
  recoveryTime: number;  // centiseconds
}

interface StrokePoint {
  dist: number;    // metres
  split: number;   // centiseconds / 500 m (lower = faster)
  spm: number;
  hr: number;
}

// ── Parsing helpers ────────────────────────────────────────────
function parseGenStatus(dv: DataView): Partial<LiveData> {
  if (dv.byteLength < 18) return {};
  const elapsedTime  = dv.getUint8(0) | (dv.getUint8(1) << 8) | (dv.getUint8(2) << 16);
  const rawDist      = dv.getUint8(3) | (dv.getUint8(4) << 8) | (dv.getUint8(5) << 16);
  const distance     = rawDist / 10;
  const workoutState = dv.getUint8(8);
  const strokeRate   = dv.byteLength > 14 ? dv.getUint8(14) : 0;
  const heartRate    = dv.byteLength > 17 ? dv.getUint8(17) : 0;
  const calories     = dv.byteLength > 12 ? dv.getUint16(11, true) : 0;
  return { elapsedTime, distance, workoutState, strokeRate, heartRate, calories };
}

function parseAddStatus(dv: DataView): Partial<LiveData> {
  if (dv.byteLength < 4) return {};
  const splitPace = dv.getUint16(0, true); // centiseconds / 500 m
  const power     = dv.byteLength >= 6 ? dv.getUint16(4, true) : 0;
  console.log('[PM5 raw LiveErgView] splitPace (centiseconds/500m):', splitPace, '| power (watts):', power, '| byteLength:', dv.byteLength);
  const paceSec = splitPace > 0 ? splitPace / 100 : 0;
  const derivedPower = paceSec > 0 ? Math.round(2.80 / Math.pow(paceSec / 500, 3)) : power;
  return { splitPace, power: derivedPower };
}

function parseStrokeData(dv: DataView): Partial<LiveData> {
  if (dv.byteLength < 4) return {};
  const driveLength   = dv.getUint8(0);                                       // cm
  const driveTime     = dv.getUint8(1);                                       // centiseconds
  const recoveryTime  = dv.byteLength >= 4 ? dv.getUint16(2, true) : 0;      // centiseconds
  return { driveLength, driveTime, recoveryTime };
}

// ── Formatters ─────────────────────────────────────────────────
function fmtTime(cs: number): string {
  const s = Math.floor(cs / 100);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

function fmtPace(cs: number): string {
  if (!cs || cs <= 0 || cs > 100000) return "--:--";
  const s = Math.floor(cs / 100);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtDriveTime(cs: number): string {
  if (!cs) return "--";
  return `${(cs / 100).toFixed(2)}s`;
}

function parseForceCurve(dv: DataView): number[] {
  if (dv.byteLength < 2) return [];
  const count = Math.min(dv.getUint8(0), 32);
  const forces: number[] = [];
  for (let i = 0; i < count && 1 + i * 2 + 1 < dv.byteLength; i++) {
    forces.push(dv.getUint16(1 + i * 2, true) / 10); // 0.1 N → N
  }
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

  const [btSupported]  = useState(() => typeof navigator !== "undefined" && "bluetooth" in navigator);
  const [connecting,   setConnecting]   = useState(false);
  const [ergConnected, setErgConnected] = useState(false);
  const [hrConnected,  setHrConnected]  = useState(false);
  const [disconnected, setDisconnected] = useState(false); // mid-workout disconnect

  const [data,    setData]    = useState<Partial<LiveData>>({});
  const [hrBpm,   setHrBpm]   = useState<number | null>(null);
  const [strokes, setStrokes] = useState<StrokePoint[]>([]);
  const [saved,   setSaved]   = useState(false);

  const [currentCurve,        setCurrentCurve]        = useState<number[]>([]);
  const [prevCurve,           setPrevCurve]           = useState<number[]>([]);
  const [allCurves,           setAllCurves]           = useState<number[][]>([]);
  const [forceCurveSupported, setForceCurveSupported] = useState<boolean | null>(null);

  const [targetInput, setTargetInput] = useState("");
  const [targetCs,    setTargetCs]    = useState<number | null>(null); // centiseconds

  const ergDeviceRef  = useRef<any>(null);
  const ergServerRef  = useRef<any>(null);
  const hrDeviceRef   = useRef<any>(null);
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
      const { data: { user } } = await supabase.auth.getUser();
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

      setSaved(true);
      toast({ title: "Workout saved", description: `${dist}m in ${dur}` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  // ── BT: connect HR ───────────────────────────────────────────
  const subscribeHR = useCallback(async (device: any) => {
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
  }, []);

  const connectHR = useCallback(async () => {
    if (!btSupported) return;
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [HR_SVC] }],
      });
      device.addEventListener("gattserverdisconnected", async () => {
        setHrConnected(false);
        setHrBpm(null);
        try {
          await subscribeHR(device);
          setHrConnected(true);
          toast({ title: "HR Monitor Reconnected" });
        } catch {
          toast({ title: "HR Monitor Disconnected" });
        }
      });
      await subscribeHR(device);
      hrDeviceRef.current = device;
      setHrConnected(true);
      toast({ title: "HR Connected", description: device.name || "Heart Rate Monitor" });
    } catch (e: any) {
      if (e.name !== "NotFoundError") {
        toast({ title: "HR Connect Failed", description: e.message, variant: "destructive" });
      }
    }
  }, [btSupported, subscribeHR, toast]);

  // ── BT: connect Erg ─────────────────────────────────────────
  const connectErg = useCallback(async () => {
    if (!btSupported) return;
    setConnecting(true);
    setDisconnected(false);
    autoSavedRef.current = false;
    prevStateRef.current = undefined;
    setSaved(false);
    setCurrentCurve([]);
    setPrevCurve([]);
    setAllCurves([]);
    setForceCurveSupported(null);

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: [C2_SERVICE] },
          { namePrefix: "PM5" },
          { namePrefix: "Concept2" },
        ],
        optionalServices: [C2_ROW_SVC],
      });

      device.addEventListener("gattserverdisconnected", async () => {
        setErgConnected(false);
        setDisconnected(true);
        // Auto-reconnect
        try {
          const srv = await device.gatt!.connect();
          ergServerRef.current = srv;
          await resubscribeErg(srv);
          setErgConnected(true);
          setDisconnected(false);
          toast({ title: "Erg Reconnected" });
        } catch {
          toast({ title: "Erg Disconnected", description: "Data preserved — tap Reconnect.", variant: "destructive" });
        }
      });

      const server = await device.gatt!.connect();
      ergDeviceRef.current = device;
      ergServerRef.current = server;
      await resubscribeErg(server);
      setErgConnected(true);
      toast({ title: "PM5 Connected", description: device.name || "Concept2 PM5" });
    } catch (e: any) {
      if (e.name !== "NotFoundError") {
        toast({ title: "Connection Failed", description: e.message, variant: "destructive" });
      }
    } finally {
      setConnecting(false);
    }
  }, [btSupported]);

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
        const forces = parseForceCurve(e.target.value);
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
    try { ergDeviceRef.current?.gatt?.disconnect(); } catch {}
    setErgConnected(false);
    ergDeviceRef.current = null;
  }, []);

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
    { label: "Elapsed",       value: data.elapsedTime ? fmtTime(data.elapsedTime) : "--:--",       big: false },
    { label: "Calories",      value: data.calories   ? `${data.calories} cal` : "-- cal",          big: false },
    { label: "Power",         value: data.power      ? `${data.power} W` : "-- W",                 big: false },
    { label: "Heart Rate",    value: hr ? `${hr} bpm` : "-- bpm",                                  big: false },
    { label: "Drive Length",  value: data.driveLength ? `${(data.driveLength / 100).toFixed(2)}m` : "--m", big: false },
    { label: "Drive Time",    value: data.driveTime ? fmtDriveTime(data.driveTime) : "--",         big: false },
    { label: "Recovery Time", value: data.recoveryTime ? fmtDriveTime(data.recoveryTime) : "--",  big: false },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
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
            <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white text-xs h-7 px-2" onClick={disconnectErg}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" className="h-8 text-xs" onClick={connectErg} disabled={connecting || !btSupported}>
              {connecting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Connecting…</>
                : <><Bluetooth className="h-3.5 w-3.5 mr-1" />Connect PM5</>}
            </Button>
          )}
        </div>
      </div>

      {/* ── Target split + reconnect notices ── */}
      {!ergConnected && !disconnected && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800">
          <span className="text-xs text-gray-400 shrink-0">Target split:</span>
          <Input
            value={targetInput}
            onChange={e => setTargetInput(e.target.value)}
            placeholder="e.g. 2:00"
            className="h-7 w-24 bg-gray-800 border-gray-700 text-white text-xs font-mono"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-700 text-gray-300 hover:text-white" onClick={applyTarget}>
            Set
          </Button>
          {targetCs && (
            <span className="text-xs text-green-400 font-mono">→ {fmtPace(targetCs)}/500m</span>
          )}
        </div>
      )}

      {disconnected && (
        <div className="flex items-center gap-3 px-4 py-2 bg-yellow-900/30 border-b border-yellow-700/40">
          <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-300">Connection lost — data preserved. Auto-reconnecting…</span>
          <Button size="sm" variant="outline" className="ml-auto h-6 text-xs border-yellow-600 text-yellow-300" onClick={connectErg} disabled={connecting}>
            {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reconnect"}
          </Button>
        </div>
      )}

      {/* ── Big stat grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-gray-800 border-b border-gray-800 flex-shrink-0">
        {statBlocks.map(({ label, value, big }) => (
          <div key={label} className={`flex flex-col items-center justify-center py-4 px-2 ${big ? "bg-gray-900 col-span-2 sm:col-span-1" : "bg-gray-950"}`}>
            <span className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</span>
            <span className={`font-mono font-bold tabular-nums leading-none ${big ? "text-4xl text-green-400" : "text-2xl text-white"}`}>
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

      {/* ── Not supported ── */}
      {!btSupported && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/95">
          <div className="text-center p-8">
            <AlertTriangle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
            <p className="text-lg font-semibold mb-2">Web Bluetooth not supported</p>
            <p className="text-sm text-gray-400">Use Chrome or Edge on desktop, or Chrome on Android.</p>
          </div>
        </div>
      )}
    </div>
  );
}
