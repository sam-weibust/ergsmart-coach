import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { c2Connect, c2Sync, c2Disconnect } from "@/lib/api";
import { getSessionUser } from '@/lib/getUser';
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

function openCenteredPopup(url: string, name: string, w = 600, h = 700): Window | null {
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
  return window.open(url, name, `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
}

export default function Concept2Section() {
  const { toast } = useToast();
  const [c2Connected, setC2Connected] = useState(false);
  const [c2LastSync, setC2LastSync] = useState<string | null>(null);
  const [isConnectingC2, setIsConnectingC2] = useState(false);
  const [isSyncingC2, setIsSyncingC2] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const successRef = useRef(false);

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

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    checkC2();

    // Listen for messages from the OAuth popup (same origin only)
    const msgHandler = (e: MessageEvent) => {
      const allowedOrigins = ["https://crewsync.app", window.location.origin];
      if (!allowedOrigins.includes(e.origin)) return;

      if (e.data?.type === "concept2_connected" && e.data?.success) {
        successRef.current = true;
        stopPolling();
        popupRef.current = null;
        setIsConnectingC2(false);
        checkC2();
        const imported = e.data.imported ?? 0;
        toast({
          title: "Concept2 connected successfully",
          description: imported > 0 ? `Imported ${imported} workout${imported === 1 ? "" : "s"}.` : undefined,
        });
      } else if (e.data?.type === "concept2_error") {
        successRef.current = true; // prevent "cancelled" toast
        stopPolling();
        popupRef.current = null;
        setIsConnectingC2(false);
        toast({ title: "Concept2 connection failed", description: e.data.error || "Unknown error", variant: "destructive" });
      }

      // Legacy message types (belt-and-suspenders)
      if (e.data?.type === "c2_auth_success") {
        successRef.current = true;
        stopPolling();
        popupRef.current = null;
        setIsConnectingC2(false);
        checkC2();
        toast({ title: "Concept2 connected successfully" });
      } else if (e.data?.type === "c2_auth_error") {
        successRef.current = true;
        stopPolling();
        popupRef.current = null;
        setIsConnectingC2(false);
        toast({ title: "Concept2 connection failed", description: e.data.error, variant: "destructive" });
      }
    };

    // Native deep-link success/error events dispatched by App.tsx
    const nativeHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsConnectingC2(false);
      checkC2();
      const imported = detail?.imported ?? 0;
      toast({
        title: "Concept2 connected successfully",
        description: imported > 0 ? `Imported ${imported} workout${imported === 1 ? "" : "s"}.` : undefined,
      });
    };
    const nativeErrorHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsConnectingC2(false);
      toast({ title: "Concept2 connection failed", description: detail?.error || "Unknown error", variant: "destructive" });
    };

    window.addEventListener("message", msgHandler);
    window.addEventListener("c2_connected", nativeHandler);
    window.addEventListener("c2_error", nativeErrorHandler);
    return () => {
      window.removeEventListener("message", msgHandler);
      window.removeEventListener("c2_connected", nativeHandler);
      window.removeEventListener("c2_error", nativeErrorHandler);
      stopPolling();
    };
  }, [checkC2, toast, stopPolling]);

  const connectC2 = async () => {
    setIsConnectingC2(true);
    successRef.current = false;
    try {
      const user = await getSessionUser();
      if (!user) { setIsConnectingC2(false); return; }

      const isNative = Capacitor.isNativePlatform();
      const redirectUri = isNative
        ? "crewsync://auth/concept2/callback"
        : "https://crewsync.app/auth/concept2/callback";

      console.log("[Concept2Section] connectC2 — redirect_uri:", redirectUri, "isNative:", isNative);

      const res = await c2Connect({ user_id: user.id, redirect_uri: redirectUri });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      console.log("[Concept2Section] opening OAuth URL:", data.url);

      if (isNative) {
        await Browser.open({ url: data.url, presentationStyle: "popover" });
        return; // result comes via appUrlOpen deep-link
      }

      // Web: open a centered popup
      const isMobileSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobileSafari) {
        // Mobile Safari blocks window.open unless called synchronously before
        // an await — fall back to same-tab redirect.
        window.location.href = data.url;
        return;
      }

      const popup = openCenteredPopup(data.url, "c2oauth");
      if (!popup || popup.closed) {
        // Popup was blocked — fall back to same-tab redirect
        window.location.href = data.url;
        return;
      }

      popupRef.current = popup;

      // Poll every 500ms to detect if the user closes the popup without completing
      pollRef.current = setInterval(() => {
        if (popup.closed) {
          stopPolling();
          popupRef.current = null;
          if (!successRef.current) {
            setIsConnectingC2(false);
            toast({ title: "Connection cancelled", description: "The Concept2 window was closed.", variant: "destructive" });
          }
        }
      }, 500);
    } catch (e: any) {
      setIsConnectingC2(false);
      toast({ title: "Failed to open Concept2 auth", description: e.message, variant: "destructive" });
    }
  };

  const syncC2 = async () => {
    setIsSyncingC2(true);
    try {
      const user = await getSessionUser();
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
      const user = await getSessionUser();
      if (!user) return;
      await c2Disconnect({ user_id: user.id });
      setC2Connected(false);
      setC2LastSync(null);
      toast({ title: "Concept2 disconnected" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img src="/c2logo.png" alt="Concept2" style={{ height: 20, width: "auto" }} />
          Concept2 Logbook Sync
        </CardTitle>
        <CardDescription>
          Import your workout history from the official Concept2 logbook via OAuth.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {c2Connected
              ? <CheckCircle2 className="h-5 w-5 text-green-500" />
              : <XCircle className="h-5 w-5 text-muted-foreground" />}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">{c2Connected ? "Connected" : "Not connected"}</p>
                {c2Connected && <img src="/c2logo.png" alt="Concept2" style={{ height: 14, width: "auto", opacity: 0.7 }} />}
              </div>
              {c2Connected && c2LastSync && (
                <p className="text-xs text-muted-foreground">
                  Last sync: {new Date(c2LastSync).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {c2Connected ? (
              <>
                <Button size="sm" onClick={syncC2} disabled={isSyncingC2}>
                  {isSyncingC2
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><RefreshCw className="h-4 w-4 mr-1" />Sync Now</>}
                </Button>
                <Button size="sm" variant="outline" onClick={disconnectC2}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={connectC2} disabled={isConnectingC2}>
                {isConnectingC2
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Waiting…</>
                  : <><img src="/c2logo.png" alt="" style={{ height: 16, width: "auto" }} className="mr-1.5" />Connect Logbook</>}
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
  );
}
