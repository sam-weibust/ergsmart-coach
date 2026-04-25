import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config/supabase";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { whoopConnect, whoopSync, whoopDisconnect } from "@/lib/api";
import { getSessionUser } from "@/lib/getUser";

export default function WhoopConnectSection() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkWhoop = useCallback(async () => {
    try {
      const user = await getSessionUser();
      if (!user) return;
      const { data } = await supabase
        .from("whoop_connections")
        .select("last_sync_at")
        .eq("user_id", user.id)
        .maybeSingle();
      setConnected(!!data);
      setLastSync(data?.last_sync_at ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    checkWhoop();
    // Check for successful callback redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("whoop") === "connected") {
      setConnected(true);
      toast({ title: "Whoop Connected!", description: "Recovery, sleep, and strain data will sync automatically." });
    }
  }, [checkWhoop, toast]);

  const connectWhoop = async () => {
    setIsConnecting(true);
    try {
      const user = await getSessionUser();
      if (!user) { setIsConnecting(false); return; }
      const res = await whoopConnect({ user_id: user.id });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e: any) {
      setIsConnecting(false);
      toast({ title: "Failed to connect Whoop", description: e.message, variant: "destructive" });
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

  const syncWhoop = async () => {
    console.log("[WhoopConnectSection] syncWhoop called, isNative:", Capacitor.isNativePlatform());
    setIsSyncing(true);
    try {
      const user = await getSessionUser();
      console.log("[WhoopConnectSection] user:", user?.id ?? "null");
      if (!user) return;
      if (Capacitor.isNativePlatform()) {
        console.log("[WhoopConnectSection] using nativeFetch for sync-whoop");
        await nativeFetch("sync-whoop", { user_id: user.id });
      } else {
        const res = await whoopSync({ user_id: user.id });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }
      setLastSync(new Date().toISOString());
      toast({ title: "Whoop Synced", description: "Recovery, sleep, and strain data updated." });
    } catch (e: any) {
      console.error("[WhoopConnectSection] syncWhoop FAILED:", e?.message, e?.stack, e);
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const disconnectWhoop = async () => {
    try {
      const user = await getSessionUser();
      if (!user) return;
      if (Capacitor.isNativePlatform()) {
        await nativeFetch("whoop-disconnect", { user_id: user.id });
      } else {
        await whoopDisconnect({ user_id: user.id });
      }
      setConnected(false);
      setLastSync(null);
      toast({ title: "Whoop disconnected" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img src="/whooplogo.png" alt="Whoop" style={{ height: 20, width: "auto" }} />
          Whoop
        </CardTitle>
        <CardDescription>
          Sync recovery scores, HRV, sleep, and strain data from your Whoop band.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {connected
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <XCircle className="h-5 w-5 text-muted-foreground" />}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{connected ? "Connected" : "Not connected"}</p>
                {connected && <img src="/whooplogo.png" alt="Whoop" style={{ height: 14, width: "auto", opacity: 0.7 }} />}
              </div>
              {connected && lastSync && (
                <p className="text-xs text-muted-foreground">
                  Last sync: {new Date(lastSync).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {connected ? (
              <>
                <Button size="sm" onClick={syncWhoop} disabled={isSyncing}>
                  {isSyncing
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><RefreshCw className="h-4 w-4 mr-1" />Sync Now</>}
                </Button>
                <Button size="sm" variant="outline" onClick={disconnectWhoop}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={connectWhoop} disabled={isConnecting}>
                {isConnecting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting…</>
                  : <><img src="/whooplogo.png" alt="" style={{ height: 16, width: "auto" }} className="mr-1.5" />Connect Whoop</>}
              </Button>
            )}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Click "Connect Whoop" and authorize with your Whoop account</li>
            <li>Recovery, sleep, and strain data import automatically</li>
            <li>Tap "Sync Now" to pull in the latest data any time</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
