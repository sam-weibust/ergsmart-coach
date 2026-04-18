import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Bluetooth, Heart, Activity, Smartphone, CheckCircle2, XCircle,
  Loader2, Zap, Timer, Gauge, RotateCcw, Link, RefreshCw,
  Scan, Radio, WifiOff,
} from "lucide-react";
import {
  initBle, listDevices, connectToDevice, startStreaming, disconnectDevice,
  BleDevice, PM5StreamData, parseHRMeasurement, HR_SERVICE, HR_MEASUREMENT,
} from "@/lib/ble";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { c2Connect, c2Sync, c2Disconnect } from "@/lib/api";

// ── Formatters ────────────────────────────────────────────────────────────────

function formatTime(cs: number): string {
  const s = Math.floor(cs / 100);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

function formatPace(cs: number): string {
  if (!cs || cs <= 0 || cs > 60000) return "--:--";
  const s = cs / 100;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}

function formatDuration(cs: number): string {
  const s = Math.floor(cs / 100);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const STATE_LABELS = ["Idle", "Countdown", "Rowing", "Paused", "Finished", "--"];

// ── Main Component ────────────────────────────────────────────────────────────

const DeviceSection = () => {
  const { toast } = useToast();

  // ── Erg state ─────────────────────────────────────────────────────────────
  const [ergConnected, setErgConnected] = useState(false);
  const [ergConnecting, setErgConnecting] = useState(false);
  const [ergDeviceName, setErgDeviceName] = useState<string | null>(null);
  const [ergDeviceId, setErgDeviceId] = useState<string | null>(null);
  const [ergData, setErgData] = useState<Partial<PM5StreamData>>({});
  const prevStateRef = useRef<number | undefined>(undefined);
  const autoSavedRef = useRef(false);

  // ── HR state ──────────────────────────────────────────────────────────────
  const [hrConnected, setHrConnected] = useState(false);
  const [hrConnecting, setHrConnecting] = useState(false);
  const [hrDeviceId, setHrDeviceId] = useState<string | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);

  // ── Scanner state ─────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<"erg" | "hr">("erg");
  const [scanning, setScanning] = useState(false);
  const [foundDevices, setFoundDevices] = useState<BleDevice[]>([]);

  // ── C2 OAuth state ────────────────────────────────────────────────────────
  const [c2Connected, setC2Connected] = useState(false);
  const [c2LastSync, setC2LastSync] = useState<string | null>(null);
  const [isConnectingC2, setIsConnectingC2] = useState(false);
  const [isSyncingC2, setIsSyncingC2] = useState(false);

  // ── Load C2 connection status ─────────────────────────────────────────────
  const checkC2 = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase as any)
        .from("concept2_tokens")
        .select("user_id, last_sync_at")
        .eq("user_id", user.id)
        .maybeSingle();
      setC2Connected(!!data);
      setC2LastSync(data?.last_sync_at ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    checkC2();
    // Listen for OAuth popup success
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "c2_auth_success") {
        setIsConnectingC2(false);
        checkC2();
        toast({ title: "Concept2 Connected!", description: `Imported ${e.data.imported ?? 0} workouts.` });
      } else if (e.data?.type === "c2_auth_error") {
        setIsConnectingC2(false);
        toast({ title: "C2 Auth Failed", description: e.data.error || "Unknown error", variant: "destructive" });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [checkC2, toast]);

  // ── Auto-save when workout finishes ───────────────────────────────────────
  useEffect(() => {
    const prev = prevStateRef.current;
    const curr = ergData.workoutState;
    prevStateRef.current = curr;
    if (prev === 2 && curr === 4 && !autoSavedRef.current && ergData.distance && ergData.elapsedTime) {
      autoSavedRef.current = true;
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const dist = Math.round(ergData.distance!);
          const dur = formatDuration(ergData.elapsedTime!);
          const avgSplitCs = (ergData.elapsedTime! / ergData.distance!) * 500;
          await supabase.from("erg_workouts").insert({
            user_id: user.id,
            workout_type: "steady_state",
            distance: dist,
            duration: dur,
            avg_split: formatPace(avgSplitCs),
            avg_heart_rate: ergData.heartRate || heartRate || null,
            calories: ergData.calories || null,
          });
          toast({ title: "Workout Saved!", description: `${dist}m auto-saved from PM5` });
        } catch (e: any) {
          toast({ title: "Auto-save failed", description: e.message, variant: "destructive" });
        }
      })();
    }
  }, [ergData.workoutState]);

  // ── Scanner ───────────────────────────────────────────────────────────────
  const openScanner = (target: "erg" | "hr") => {
    setScanTarget(target);
    setFoundDevices([]);
    setScannerOpen(true);
  };

  const startScan = async () => {
    setScanning(true);
    setFoundDevices([]);
    try {
      await initBle();
      const devices = await listDevices(5000);
      setFoundDevices(devices);
      if (devices.length === 0) toast({ title: "No devices found", description: "Make sure your device is on and in range." });
    } catch (e: any) {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const pickDevice = async (device: BleDevice) => {
    setScannerOpen(false);
    if (scanTarget === "erg") {
      await connectErg(device.deviceId, device.name);
    } else {
      await connectHR(device.deviceId, device.name);
    }
  };

  // ── Erg connect ───────────────────────────────────────────────────────────
  const connectErg = async (deviceId: string, name: string) => {
    setErgConnecting(true);
    autoSavedRef.current = false;
    prevStateRef.current = undefined;
    try {
      await connectToDevice(deviceId, () => {
        setErgConnected(false);
        toast({ title: "Erg disconnected", description: "Attempting to reconnect…" });
        // Reconnect handled in ble.ts
      });
      await startStreaming(deviceId, (update) => {
        setErgData(prev => ({ ...prev, ...update }));
      });
      setErgDeviceId(deviceId);
      setErgDeviceName(name);
      setErgConnected(true);
      toast({ title: "PM5 Connected", description: name });
    } catch (e: any) {
      toast({ title: "Connection Failed", description: e.message, variant: "destructive" });
    } finally {
      setErgConnecting(false);
    }
  };

  const disconnectErg = async () => {
    if (ergDeviceId) await disconnectDevice(ergDeviceId);
    setErgConnected(false);
    setErgDeviceId(null);
    setErgDeviceName(null);
    setErgData({});
  };

  // ── HR connect ────────────────────────────────────────────────────────────
  const connectHR = async (deviceId: string, name: string) => {
    setHrConnecting(true);
    try {
      await connectToDevice(deviceId, () => {
        setHrConnected(false);
        setHeartRate(null);
        toast({ title: "HR Monitor disconnected" });
      });
      await BleClient.startNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
        const hr = parseHRMeasurement(value);
        if (hr !== null) {
          setHeartRate(hr);
          setErgData(prev => ({ ...prev, heartRate: hr }));
        }
      });
      setHrDeviceId(deviceId);
      setHrConnected(true);
      toast({ title: "HR Monitor Connected", description: name });
    } catch (e: any) {
      toast({ title: "Connection Failed", description: e.message, variant: "destructive" });
    } finally {
      setHrConnecting(false);
    }
  };

  const disconnectHR = async () => {
    if (hrDeviceId) await disconnectDevice(hrDeviceId);
    setHrConnected(false);
    setHrDeviceId(null);
    setHeartRate(null);
  };

  // ── C2 OAuth ──────────────────────────────────────────────────────────────
  const connectC2 = async () => {
    setIsConnectingC2(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsConnectingC2(false); return; }
      const res = await c2Connect({ user_id: user.id });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      window.open(data.url, "c2_oauth", "width=520,height=620,left=200,top=100");
    } catch (e: any) {
      setIsConnectingC2(false);
      toast({ title: "Failed to open Concept2 auth", description: e.message, variant: "destructive" });
    }
  };

  const syncC2 = async () => {
    setIsSyncingC2(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const res = await c2Sync({ user_id: user.id });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast({ title: "Sync Complete", description: `${data.imported ?? 0} workouts synced` });
      checkC2();
    } catch (e: any) {
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSyncingC2(false);
    }
  };

  const disconnectC2 = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await c2Disconnect({ user_id: user.id });
      setC2Connected(false);
      setC2LastSync(null);
      toast({ title: "Concept2 disconnected" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const stateLabel = STATE_LABELS[ergData.workoutState ?? 5];
  const isRowing = ergData.workoutState === 2;

  return (
    <div className="space-y-6">

      {/* PM5 Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Concept2 PM5 — Live Data
          </CardTitle>
          <CardDescription>Connect via Bluetooth for real-time splits, power, and stroke rate.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${ergConnected ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="font-medium text-sm">{ergConnected ? (ergDeviceName || "Concept2 Erg") : "Not connected"}</span>
              {ergConnected && (
                <Badge variant="outline" className={isRowing ? "border-green-500/40 bg-green-500/10 text-green-600" : "border-muted text-muted-foreground"}>
                  {stateLabel}
                </Badge>
              )}
            </div>
            {ergConnected ? (
              <Button variant="outline" size="sm" onClick={disconnectErg}>Disconnect</Button>
            ) : (
              <Button size="sm" onClick={() => openScanner("erg")} disabled={ergConnecting}>
                {ergConnecting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting…</> : <><Scan className="h-4 w-4 mr-2" />Scan for PM5</>}
              </Button>
            )}
          </div>

          {ergConnected && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t">
              {[
                { label: "Time",        icon: <Timer className="h-3 w-3" />,            value: ergData.elapsedTime ? formatTime(ergData.elapsedTime) : "--:--",     accent: false },
                { label: "Distance",    icon: <Activity className="h-3 w-3" />,         value: ergData.distance ? `${Math.round(ergData.distance)}m` : "---m",       accent: false },
                { label: "Split /500m", icon: <Gauge className="h-3 w-3" />,            value: formatPace(ergData.splitPace ?? 0),                                   accent: true  },
                { label: "Stroke Rate", icon: <RotateCcw className="h-3 w-3" />,        value: ergData.strokeRate ? `${ergData.strokeRate} spm` : "-- spm",          accent: false },
                { label: "Power",       icon: <Zap className="h-3 w-3" />,              value: ergData.power ? `${ergData.power} W` : "-- W",                        accent: false },
                { label: "Heart Rate",  icon: <Heart className="h-3 w-3 text-red-500" />, value: (ergData.heartRate || heartRate) ? `${ergData.heartRate || heartRate} bpm` : "-- bpm", accent: false },
              ].map(({ label, icon, value, accent }) => (
                <div key={label} className={`p-3 rounded-xl text-center ${accent ? "bg-primary/5 border border-primary/20" : "bg-muted/50"}`}>
                  <div className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">{icon} {label}</div>
                  <div className={`text-xl font-mono font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {ergConnected && (ergData.driveLength || ergData.driveTime || ergData.recoveryTime) && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t">
              {[
                { label: "Drive Length", value: ergData.driveLength ? `${(ergData.driveLength / 10).toFixed(1)} m` : "--" },
                { label: "Drive Time",   value: ergData.driveTime   ? `${ergData.driveTime} ms`  : "--" },
                { label: "Recovery",     value: ergData.recoveryTime? `${ergData.recoveryTime} ms`: "--" },
              ].map(({ label, value }) => (
                <div key={label} className="p-2 rounded-lg bg-muted/50 text-center">
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className="text-sm font-mono font-semibold">{value}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* HR Monitor Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Heart Rate Monitor
          </CardTitle>
          <CardDescription>Connect a BLE heart rate strap. Data merges into the PM5 display above.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${hrConnected ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="font-medium text-sm">{hrConnected ? "HR Monitor" : "Not connected"}</span>
              {hrConnected && heartRate && (
                <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-600 font-mono">{heartRate} bpm</Badge>
              )}
            </div>
            {hrConnected ? (
              <Button variant="outline" size="sm" onClick={disconnectHR}>Disconnect</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => openScanner("hr")} disabled={hrConnecting}>
                {hrConnecting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting…</> : <><Bluetooth className="h-4 w-4 mr-2" />Connect HR Monitor</>}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* C2 OAuth Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Concept2 Logbook Sync
          </CardTitle>
          <CardDescription>Import your workout history from the official Concept2 logbook via OAuth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {c2Connected ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="font-medium text-sm">{c2Connected ? "Connected" : "Not connected"}</p>
                {c2Connected && c2LastSync && (
                  <p className="text-xs text-muted-foreground">Last sync: {new Date(c2LastSync).toLocaleDateString()}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {c2Connected ? (
                <>
                  <Button size="sm" onClick={syncC2} disabled={isSyncingC2}>
                    {isSyncingC2 ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" />Sync Now</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={disconnectC2}>Disconnect</Button>
                </>
              ) : (
                <Button size="sm" onClick={connectC2} disabled={isConnectingC2}>
                  {isConnectingC2 ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Waiting…</> : "Connect Logbook"}
                </Button>
              )}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Click "Connect Logbook" and log in with your Concept2 account</li>
              <li>Your past workouts import automatically</li>
              <li>Tap "Sync Now" to pull in new workouts any time</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* No Bluetooth fallback */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> No Bluetooth? No Problem</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            In the <strong>Log</strong> tab, tap the camera icon to photograph your PM5 screen —
            AI reads the numbers automatically. Or type them in manually.
          </p>
        </CardContent>
      </Card>

      {/* Device Picker Dialog */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary" />
              {scanTarget === "erg" ? "Connect PM5 / Erg" : "Connect HR Monitor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button onClick={startScan} disabled={scanning} className="w-full" variant="outline">
              {scanning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scanning (5s)…</> : <><Scan className="h-4 w-4 mr-2" />Scan for Devices</>}
            </Button>

            {foundDevices.length === 0 && !scanning && (
              <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                <WifiOff className="h-8 w-8 opacity-40" />
                <p className="text-sm">No devices found yet. Tap Scan to search.</p>
              </div>
            )}

            <div className="space-y-2">
              {foundDevices.map(device => (
                <button
                  key={device.deviceId}
                  onClick={() => pickDevice(device)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                >
                  <div className="p-2 bg-primary/10 rounded-lg">
                    {device.isPM5 ? <Activity className="h-4 w-4 text-primary" /> : <Heart className="h-4 w-4 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{device.name}</p>
                    <p className="text-xs text-muted-foreground">{device.isPM5 ? "Concept2 PM5" : device.isHR ? "Heart Rate Monitor" : "BLE Device"}</p>
                  </div>
                  {device.rssi && (
                    <span className="text-xs text-muted-foreground">{device.rssi} dBm</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeviceSection;
