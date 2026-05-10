import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config/supabase";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { whoopConnect, whoopSync, whoopDisconnect } from "@/lib/api";
import { getSessionUser } from "@/lib/getUser";

function openCenteredPopup(url: string, name: string, w = 600, h = 700): Window | null {
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  return window.open(url, name, `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
}

export default function WhoopConnectSection() {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastAutoSync, setLastAutoSync] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successRef = useRef(false);

  function formatAutoSync(ts: string): string {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
    if (isToday) return `today at ${timeStr}`;
    return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${timeStr}`;
  }

  const checkWhoop = useCallback(async () => {
    try {
      const user = await getSessionUser();
      if (!user) return;
      const { data } = await supabase
        .from("whoop_connections")
        .select("last_sync_at, last_auto_sync_at")
        .eq("user_id", user.id)
        .maybeSingle();
      setConnected(!!data);
      setLastSync(data?.last_sync_at ?? null);
      setLastAutoSync((data as any)?.last_auto_sync_at ?? null);
    } catch {}
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    checkWhoop();

    // Check for successful same-tab redirect fallback (mobile Safari)
    const params = new URLSearchParams(window.location.search);
    if (params.get("whoop") === "connected") {
      setConnected(true);
      toast({ title: "Whoop connected successfully", description: "Recovery, sleep, and strain data will sync automatically." });
      params.delete("whoop");
      const newSearch = params.toString();
      window.history.replaceState({}, "", newSearch ? `?${newSearch}` : window.location.pathname);
    }

    // Listen for messages from the OAuth popup (same origin only)
    const msgHandler = (e: MessageEvent) => {
      const allowedOrigins = ["https://crewsync.app", window.location.origin];
      if (!allowedOrigins.includes(e.origin)) return;

      if (e.data?.type === "whoop_connected" && e.data?.success) {
        successRef.current = true;
        stopPolling();
        popupRef.current = null;
        setIsConnecting(false);
        checkWhoop();
        toast({ title: "Whoop connected successfully", description: "Recovery, sleep, and strain data will sync automatically." });
      } else if (e.data?.type === "whoop_error") {
        successRef.current = true;
        stopPolling();
        popupRef.current = null;
        setIsConnecting(false);
        toast({ title: "Whoop connection failed", description: e.data.error || "Unknown error", variant: "destructive" });
      }
    };

    // Native deep-link events dispatched by App.tsx
    const nativeHandler = () => { setIsConnecting(false); checkWhoop(); };

    window.addEventListener("message", msgHandler);
    window.addEventListener("whoop_connected", nativeHandler);
    return () => {
      window.removeEventListener("message", msgHandler);
      window.removeEventListener("whoop_connected", nativeHandler);
      stopPolling();
    };
  }, [checkWhoop, toast, stopPolling]);

  const connectWhoop = async () => {
    setIsConnecting(true);
    successRef.current = false;
    try {
      const user = await getSessionUser();
      if (!user) { setIsConnecting(false); return; }
      const isNative = Capacitor.isNativePlatform();
      const redirectUri = isNative
        ? "crewsync://auth/whoop/callback"
        : "https://crewsync.app/auth/whoop/callback";

      console.log("[WhoopConnectSection] connectWhoop — redirect_uri:", redirectUri, "isNative:", isNative);

      const res = await whoopConnect({ user_id: user.id, redirect_uri: redirectUri });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      console.log("[WhoopConnectSection] opening OAuth URL:", data.url);

      if (isNative) {
        await Browser.open({ url: data.url, presentationStyle: "popover" });
        return;
      }

      const isMobileSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobileSafari) {
        window.location.href = data.url;
        return;
      }

      const popup = openCenteredPopup(data.url, "whoopoauth");
      if (!popup || popup.closed) {
        window.location.href = data.url;
        return;
      }

      popupRef.current = popup;

      pollRef.current = setInterval(() => {
        if (popup.closed) {
          stopPolling();
          popupRef.current = null;
          if (!successRef.current) {
            setIsConnecting(false);
            toast({ title: "Connection cancelled", description: "The Whoop window was closed.", variant: "destructive" });
          }
        }
      }, 500);
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
      setLastAutoSync(null);
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
              {connected && lastAutoSync && (
                <p className="text-xs text-muted-foreground">
                  Last auto-synced {formatAutoSync(lastAutoSync)}
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
