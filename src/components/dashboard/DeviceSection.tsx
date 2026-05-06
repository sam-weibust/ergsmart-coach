import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config/supabase";
import {
  Bluetooth, Heart, Activity, Smartphone, CheckCircle2, XCircle,
  Loader2, Zap, Timer, Gauge, RotateCcw, Link, RefreshCw,
  Scan, Radio, WifiOff, AlertTriangle, Construction,
} from "lucide-react";
import {
  initBle, listDevices, connectToDevice, startStreaming, disconnectDevice,
  startNotification, isNativePlatform, isWebBluetoothSupported,
  BleDevice, BleInitStatus, PM5StreamData, parseHRMeasurement, HR_SERVICE, HR_MEASUREMENT,
} from "@/lib/ble";
import { c2Connect, c2Sync, c2Disconnect } from "@/lib/api";
import { getSessionUser } from '@/lib/getUser';

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

  // ── BLE permission / status state ─────────────────────────────────────────
  const [bleStatus, setBleStatus] = useState<BleInitStatus | 'unknown'>('unknown');

  // On native, initialize BLE early to trigger permission dialog
  useEffect(() => {
    if (!isNativePlatform()) return;
    initBle().then(setBleStatus);
  }, []);

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
      const user = await getSessionUser();
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
          const user = await getSessionUser();
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
      if (isNativePlatform()) {
        const status = await initBle();
        setBleStatus(status);
        if (status === 'permission_denied') {
          toast({ title: "Bluetooth permission denied", description: "Go to Settings → CrewSync → enable Bluetooth to connect your PM5.", variant: "destructive" });
          return;
        }
        if (status === 'bluetooth_off') {
          toast({ title: "Bluetooth is off", description: "Turn on Bluetooth in Settings to connect your PM5.", variant: "destructive" });
          return;
        }
        if (status !== 'ready') {
          toast({ title: "Bluetooth unavailable", description: "Could not initialize Bluetooth.", variant: "destructive" });
          return;
        }
        const devices = await listDevices(5000);
        setFoundDevices(devices);
        if (devices.length === 0) toast({ title: "No devices found", description: "Make sure your device is on and in range." });
      } else {
        // Web: requestDevice opens the browser's native picker.
        // After selection, close our dialog and connect directly.
        const devices = await listDevices(5000);
        if (devices.length > 0) {
          setScannerOpen(false);
          if (scanTarget === "erg") {
            await connectErg(devices[0].deviceId, devices[0].name);
          } else {
            await connectHR(devices[0].deviceId, devices[0].name);
          }
        }
      }
    } catch (e: any) {
      const msg: string = e?.message || "";
      if (msg === 'PERMISSION_DENIED') {
        setBleStatus('permission_denied');
        toast({ title: "Bluetooth permission denied", description: "Go to Settings → CrewSync → enable Bluetooth to connect your PM5.", variant: "destructive" });
      } else if (msg === 'BLUETOOTH_OFF') {
        setBleStatus('bluetooth_off');
        toast({ title: "Bluetooth is off", description: "Turn on Bluetooth in Settings to connect your PM5.", variant: "destructive" });
      } else if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("chooser")) {
        toast({ title: "Scan failed", description: msg, variant: "destructive" });
      }
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
      await startNotification(deviceId, HR_SERVICE, HR_MEASUREMENT, (value) => {
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
      const user = await getSessionUser();
      if (!user) { setIsConnectingC2(false); return; }
      const redirectUri = "https://clmesnkdwohtvduzdgex.supabase.co/functions/v1/c2-logbook-auth";
      const res = await c2Connect({ user_id: user.id, redirect_uri: redirectUri });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const popup = window.open(data.url, "c2_auth", "width=500,height=600,scrollbars=yes");
      if (!popup) {
        toast({ title: "Popup blocked", description: "Please allow popups for this site and try again.", variant: "destructive" });
        setIsConnectingC2(false);
        return;
      }
    } catch (e: any) {
      setIsConnectingC2(false);
      toast({ title: "Failed to open Concept2 auth", description: e.message, variant: "destructive" });
    }
  };

  const nativeFetch = async (fnName: string, body: object) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const syncC2 = async () => {
    setIsSyncingC2(true);
    try {
      const user = await getSessionUser();
      if (!user) return;
      let data;
      if (isNativePlatform()) {
        data = await nativeFetch("sync-concept2", { user_id: user.id });
      } else {
        const res = await c2Sync({ user_id: user.id });
        data = await res.json();
        if (data.error) throw new Error(data.error);
      }
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
      const user = await getSessionUser();
      if (!user) return;
      if (isNativePlatform()) {
        await nativeFetch("c2-disconnect", { user_id: user.id });
      } else {
        await c2Disconnect({ user_id: user.id });
      }
      setC2Connected(false);
      setC2LastSync(null);
      toast({ title: "Concept2 disconnected" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const stateLabel = STATE_LABELS[ergData.workoutState ?? 5];
  const isRowing = ergData.workoutState === 2;

  const webBtUnsupported = !isNativePlatform() && !isWebBluetoothSupported();
  const btScanDisabled = webBtUnsupported || bleStatus === 'permission_denied' || bleStatus === 'bluetooth_off';

  return (
    <div className="space-y-6">

      {/* Browser compatibility warning */}
      {webBtUnsupported && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Bluetooth not supported in this browser</p>
            <p className="mt-0.5 text-yellow-600 dark:text-yellow-500">
              Safari and Firefox do not support Web Bluetooth. To connect your PM5 or heart rate monitor, please open this page in <strong>Chrome</strong> or <strong>Edge</strong>.
            </p>
          </div>
        </div>
      )}

      {/* iOS Bluetooth off warning */}
      {bleStatus === 'bluetooth_off' && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Bluetooth is off</p>
            <p className="mt-0.5 text-yellow-600 dark:text-yellow-500">Turn on Bluetooth in Settings to connect your PM5.</p>
          </div>
        </div>
      )}

      {/* iOS Bluetooth permission denied warning */}
      {bleStatus === 'permission_denied' && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Bluetooth permission denied</p>
            <p className="mt-0.5 text-red-600 dark:text-red-500">Go to <strong>Settings → CrewSync</strong> and enable Bluetooth to connect your PM5.</p>
          </div>
        </div>
      )}

      {/* PM5 Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Concept2 PM5 — Live Data
          </CardTitle>
          <CardDescription>Connect via Bluetooth for real-time splits, power, and stroke rate.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <Construction className="h-10 w-10 text-muted-foreground" />
          <p className="font-semibold text-foreground">Live Erg Connection — Coming Soon</p>
          <p className="text-sm text-muted-foreground max-w-sm">Direct PM5 Bluetooth sync is under development. In the meantime, use the camera button in the Log tab to photograph your PM5 screen.</p>
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
              <Button size="sm" variant="outline" onClick={() => openScanner("hr")} disabled={hrConnecting || btScanDisabled}>
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
