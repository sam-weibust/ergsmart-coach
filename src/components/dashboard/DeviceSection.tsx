import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Bluetooth, Heart, Activity, Smartphone, CheckCircle2, XCircle,
  AlertCircle, Link, Loader2, Zap, Timer, Gauge, RotateCcw,
} from "lucide-react";

const C2_SERVICE           = "ce060000-43e5-11e4-916c-0800200c9a66";
const C2_ROWING_SERVICE    = "ce060030-43e5-11e4-916c-0800200c9a66";
const C2_ROWING_STATUS     = "ce060031-43e5-11e4-916c-0800200c9a66";
const C2_ROWING_ADDITIONAL = "ce060032-43e5-11e4-916c-0800200c9a66";
const HR_SERVICE           = "heart_rate";
const HR_MEASUREMENT       = "heart_rate_measurement";

interface ErgData {
  distance: number;
  elapsedTime: number;
  splitPace: number;
  strokeRate: number;
  power: number;
  calories: number;
  heartRate: number;
  workoutState: number;
}

interface C2Connection {
  id: string;
  c2_user_id: string;
  last_sync_at: string | null;
}

function parseErgStatus(dv: DataView): Partial<ErgData> {
  try {
    return {
      elapsedTime:  dv.getUint16(0, true) + dv.getUint8(2) * 65536,
      distance:     (dv.getUint16(3, true) + dv.getUint8(5) * 65536) / 10,
      workoutState: dv.getUint8(8),
      strokeRate:   dv.getUint8(9),
      heartRate:    dv.getUint8(10),
      calories:     dv.getUint16(13, true),
    };
  } catch { return {}; }
}

function parseErgAdditional(dv: DataView): Partial<ErgData> {
  try {
    return {
      splitPace: dv.getUint16(0, true),
      power:     dv.getUint16(3, true),
    };
  } catch { return {}; }
}

function formatPace(tenths: number): string {
  if (!tenths || tenths <= 0 || tenths > 60000) return "--:--";
  const s = tenths / 10;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

function formatTime(tenths: number): string {
  const s = Math.floor(tenths / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

function formatDuration(tenths: number): string {
  const totalSec = Math.floor(tenths / 10);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATE_LABELS = ["Idle","Countdown","Rowing","Paused","Finished","--"];

const DeviceSection = () => {
  const { toast } = useToast();

  const [webBtSupported, setWebBtSupported] = useState(false);
  const [ergDevice, setErgDevice] = useState<any>(null);
  const [hrDevice, setHrDevice] = useState<any>(null);
  const [ergConnected, setErgConnected] = useState(false);
  const [hrConnected, setHrConnected] = useState(false);
  const [ergConnecting, setErgConnecting] = useState(false);
  const [hrConnecting, setHrConnecting] = useState(false);
  const [ergData, setErgData] = useState<Partial<ErgData>>({});
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [c2Connection, setC2Connection] = useState<C2Connection | null>(null);
  const [isConnectingC2, setIsConnectingC2] = useState(false);
  const [isSyncingC2, setIsSyncingC2] = useState(false);

  const ergServerRef = useRef<any>(null);
  const hrServerRef = useRef<any>(null);
  const hrDeviceRef = useRef<any>(null);
  const prevWorkoutState = useRef<number | undefined>(undefined);
  const autoSavedRef = useRef(false);

  const checkC2Connection = useCallback(async () => {
    try {
      const { data } = await supabase.from("c2_connections").select("*").limit(1);
      if (data?.length) setC2Connection(data[0]);
    } catch {}
  }, []);

  useEffect(() => {
    setWebBtSupported("bluetooth" in navigator);
    checkC2Connection();

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "c2_auth_success") {
        checkC2Connection();
        setIsConnectingC2(false);
        toast({ title: "C2 Logbook Connected" });
      } else if (e.data?.type === "c2_auth_error") {
        setIsConnectingC2(false);
        toast({ title: "C2 Auth Failed", description: e.data.error || "Unknown error", variant: "destructive" });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [checkC2Connection, toast]);

  // Auto-save when workout finishes
  useEffect(() => {
    const prev = prevWorkoutState.current;
    const curr = ergData.workoutState;
    prevWorkoutState.current = curr;

    if (prev === 2 && curr === 4 && !autoSavedRef.current && ergData.distance && ergData.elapsedTime) {
      autoSavedRef.current = true;
      const dist = Math.round(ergData.distance);
      const dur = formatDuration(ergData.elapsedTime);
      const avgSplitTenths = (ergData.elapsedTime / ergData.distance) * 500;
      const avgSplit = formatPace(avgSplitTenths);

      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          await supabase.from("erg_workouts").insert({
            user_id: user.id,
            workout_type: "steady_state",
            distance: dist,
            duration: dur,
            avg_split: avgSplit,
            avg_heart_rate: ergData.heartRate || null,
            calories: ergData.calories || null,
          });
          toast({ title: "Workout auto-saved from PM5" });
        } catch (e: any) {
          toast({ title: "Auto-save failed", description: e.message, variant: "destructive" });
        }
      })();
    }
  }, [ergData.workoutState, ergData.distance, ergData.elapsedTime, ergData.heartRate, ergData.calories, toast]);

  const connectC2Logbook = async () => {
    setIsConnectingC2(true);
    try {
      const { data, error } = await supabase.functions.invoke("c2-logbook-auth", {
        body: { action: "get_auth_url" },
      });
      if (error) throw error;
      window.open(data.auth_url, "c2_auth", "width=500,height=600");
      // Success/failure handled by postMessage listener
    } catch (e: any) {
      setIsConnectingC2(false);
      toast({ title: "Connection Failed", description: e.message, variant: "destructive" });
    }
  };

  const disconnectC2Logbook = async () => {
    try {
      await supabase.from("c2_connections").delete().eq("id", c2Connection?.id);
      setC2Connection(null);
      toast({ title: "C2 Logbook disconnected" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const syncC2Workouts = async () => {
    setIsSyncingC2(true);
    try {
      const { data, error } = await supabase.functions.invoke("c2-logbook-sync");
      if (error) throw error;
      toast({ title: "Sync Complete", description: `Synced ${data.synced_count} new workouts` });
      await checkC2Connection();
    } catch (e: any) {
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSyncingC2(false);
    }
  };

  const connectErg = useCallback(async () => {
    if (!webBtSupported) return;
    setErgConnecting(true);
    autoSavedRef.current = false;
    prevWorkoutState.current = undefined;
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: [C2_SERVICE] },
          { namePrefix: "PM5" },
          { namePrefix: "Concept2" },
        ],
        optionalServices: [C2_ROWING_SERVICE],
      });

      device.addEventListener("gattserverdisconnected", () => {
        setErgConnected(false);
        setErgData({});
        toast({ title: "Erg disconnected" });
      });

      const server = await device.gatt!.connect();
      ergServerRef.current = server;
      const service = await server.getPrimaryService(C2_ROWING_SERVICE);

      try {
        const sc = await service.getCharacteristic(C2_ROWING_STATUS);
        await sc.startNotifications();
        sc.addEventListener("characteristicvaluechanged", (e: any) => {
          setErgData(prev => ({ ...prev, ...parseErgStatus(e.target.value) }));
        });
      } catch {}

      try {
        const ac = await service.getCharacteristic(C2_ROWING_ADDITIONAL);
        await ac.startNotifications();
        ac.addEventListener("characteristicvaluechanged", (e: any) => {
          setErgData(prev => ({ ...prev, ...parseErgAdditional(e.target.value) }));
        });
      } catch {}

      setErgDevice(device);
      setErgConnected(true);
      toast({ title: "PM5 Connected", description: device.name || "Concept2 Erg" });
    } catch (e: any) {
      if (e.name !== "NotFoundError") {
        toast({ title: "Connection Failed", description: e.message || "Could not connect to erg", variant: "destructive" });
      }
    } finally {
      setErgConnecting(false);
    }
  }, [webBtSupported, toast]);

  const disconnectErg = useCallback(() => {
    try { ergServerRef.current?.disconnect(); } catch {}
    setErgConnected(false);
    setErgDevice(null);
    setErgData({});
  }, []);

  const subscribeHR = useCallback(async (device: any) => {
    const server = await device.gatt!.connect();
    hrServerRef.current = server;
    const service = await server.getPrimaryService(HR_SERVICE);
    const char = await service.getCharacteristic(HR_MEASUREMENT);
    await char.startNotifications();
    char.addEventListener("characteristicvaluechanged", (e: any) => {
      const dv = e.target.value as DataView;
      const isUint16 = dv.getUint8(0) & 0x1;
      const hr = isUint16 ? dv.getUint16(1, true) : dv.getUint8(1);
      setHeartRate(hr);
      setErgData(prev => ({ ...prev, heartRate: hr }));
    });
    return server;
  }, []);

  const connectHR = useCallback(async () => {
    if (!webBtSupported) return;
    setHrConnecting(true);
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [HR_SERVICE] }],
      });

      device.addEventListener("gattserverdisconnected", async () => {
        setHrConnected(false);
        setHeartRate(null);
        // Auto-reconnect attempt
        try {
          await subscribeHR(device);
          setHrConnected(true);
          toast({ title: "HR Monitor Reconnected" });
        } catch {
          toast({ title: "HR Monitor Disconnected", description: "Tap Reconnect to retry." });
        }
      });

      await subscribeHR(device);
      hrDeviceRef.current = device;
      setHrDevice(device);
      setHrConnected(true);
      toast({ title: "HR Monitor Connected", description: device.name || "Heart Rate Monitor" });
    } catch (e: any) {
      if (e.name !== "NotFoundError") {
        toast({ title: "Connection Failed", description: e.message || "Could not connect to HR monitor", variant: "destructive" });
      }
    } finally {
      setHrConnecting(false);
    }
  }, [webBtSupported, subscribeHR, toast]);

  const disconnectHR = useCallback(() => {
    try { hrDeviceRef.current?.gatt?.disconnect(); } catch {}
    setHrConnected(false);
    setHrDevice(null);
    hrDeviceRef.current = null;
    setHeartRate(null);
  }, []);

  const stateLabel = STATE_LABELS[ergData.workoutState ?? 5];
  const isRowing = ergData.workoutState === 2;

  return (
    <div className="space-y-6">
      {!webBtSupported && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">Web Bluetooth not available</p>
              <p className="text-amber-700 dark:text-amber-300 mt-1">
                Requires Chrome or Edge on desktop, or Chrome on Android.
                Not supported in Firefox, Safari, or iOS browsers.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Concept2 PM5 — Live Data
          </CardTitle>
          <CardDescription>
            Connect directly to your PM5 via Bluetooth for real-time splits, power, and stroke rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full transition-colors ${ergConnected ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="font-medium text-sm">
                {ergConnected ? (ergDevice?.name || "Concept2 Erg") : "Not connected"}
              </span>
              {ergConnected && (
                <Badge variant="outline" className={isRowing
                  ? "border-green-500/40 bg-green-500/10 text-green-600"
                  : "border-muted text-muted-foreground"
                }>
                  {stateLabel}
                </Badge>
              )}
            </div>
            {ergConnected ? (
              <Button variant="outline" size="sm" onClick={disconnectErg}>Disconnect</Button>
            ) : (
              <Button size="sm" onClick={connectErg} disabled={ergConnecting || !webBtSupported}>
                {ergConnecting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>
                  : <><Bluetooth className="h-4 w-4 mr-2" />Connect PM5</>
                }
              </Button>
            )}
          </div>

          {ergConnected && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t">
              {[
                { label: "Time",        icon: <Timer className="h-3 w-3" />,     value: ergData.elapsedTime ? formatTime(ergData.elapsedTime) : "--:--",         accent: false },
                { label: "Distance",    icon: <Activity className="h-3 w-3" />,  value: ergData.distance ? `${Math.round(ergData.distance)}m` : "---m",          accent: false },
                { label: "Split /500m", icon: <Gauge className="h-3 w-3" />,     value: formatPace(ergData.splitPace ?? 0),                                      accent: true  },
                { label: "Stroke Rate", icon: <RotateCcw className="h-3 w-3" />, value: ergData.strokeRate ? `${ergData.strokeRate} spm` : "-- spm",             accent: false },
                { label: "Power",       icon: <Zap className="h-3 w-3" />,       value: ergData.power ? `${ergData.power} W` : "-- W",                           accent: false },
                { label: "Heart Rate",  icon: <Heart className="h-3 w-3 text-red-500" />, value: (ergData.heartRate || heartRate) ? `${ergData.heartRate || heartRate} bpm` : "-- bpm", accent: false },
              ].map(({ label, icon, value, accent }) => (
                <div key={label} className={`p-3 rounded-xl text-center ${accent ? "bg-primary/5 border border-primary/20" : "bg-muted/50"}`}>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    {icon} {label}
                  </div>
                  <div className={`text-xl font-mono font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {!ergConnected && webBtSupported && (
            <div className="p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">How to connect:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Wake your PM5 and enable Bluetooth on this device</li>
                <li>Click "Connect PM5" and pick your erg from the browser popup</li>
                <li>Start rowing — data appears automatically</li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Heart Rate Monitor
          </CardTitle>
          <CardDescription>
            Connect a separate BLE heart rate strap if needed. Data merges automatically into the PM5 display above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${hrConnected ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="font-medium text-sm">
                {hrConnected ? (hrDevice?.name || "HR Monitor") : "Not connected"}
              </span>
              {hrConnected && heartRate && (
                <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-600 font-mono">
                  {heartRate} bpm
                </Badge>
              )}
            </div>
            {hrConnected ? (
              <Button variant="outline" size="sm" onClick={disconnectHR}>Disconnect</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={connectHR} disabled={hrConnecting || !webBtSupported}>
                {hrConnecting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>
                  : <><Bluetooth className="h-4 w-4 mr-2" />Connect HR Monitor</>
                }
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Concept2 Logbook Sync
          </CardTitle>
          <CardDescription>
            Import your existing workout history from the official Concept2 logbook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {c2Connection
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <XCircle className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="font-medium text-sm">{c2Connection ? "Connected" : "Not connected"}</p>
                {c2Connection && (
                  <p className="text-xs text-muted-foreground">
                    Last sync: {c2Connection.last_sync_at
                      ? new Date(c2Connection.last_sync_at).toLocaleDateString()
                      : "Never"}
                  </p>
                )}
              </div>
            </div>
            {c2Connection ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={syncC2Workouts} disabled={isSyncingC2}>
                  {isSyncingC2 ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sync Now"}
                </Button>
                <Button size="sm" variant="outline" onClick={disconnectC2Logbook}>Disconnect</Button>
              </div>
            ) : (
              <Button size="sm" onClick={connectC2Logbook} disabled={isConnectingC2}>
                {isConnectingC2
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>
                  : "Connect Logbook"}
              </Button>
            )}
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How it works:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Authenticate with your Concept2 account (one-time)</li>
              <li>Row normally with ErgData — it syncs to your C2 logbook</li>
              <li>Click "Sync Now" to pull those workouts into CrewSync</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            No Bluetooth? No Problem
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            In the <strong>Log</strong> tab, tap the camera icon to photograph your PM5 screen —
            AI reads the numbers automatically. Or just type them in manually.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeviceSection;
