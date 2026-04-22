import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Link } from "lucide-react";
import { c2Connect, c2Sync, c2Disconnect } from "@/lib/api";
import { getSessionUser } from '@/lib/getUser';

export default function Concept2Section() {
  const { toast } = useToast();
  const [c2Connected, setC2Connected] = useState(false);
  const [c2LastSync, setC2LastSync] = useState<string | null>(null);
  const [isConnectingC2, setIsConnectingC2] = useState(false);
  const [isSyncingC2, setIsSyncingC2] = useState(false);

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

  const connectC2 = async () => {
    setIsConnectingC2(true);
    try {
      const user = await getSessionUser();
      if (!user) { setIsConnectingC2(false); return; }

      // Safari requires window.open() to be called synchronously within a user gesture.
      // Open a blank popup NOW before any async work, then navigate it once we have the URL.
      // On mobile Safari, window.open returns null or doesn't support window.opener —
      // fall back to a same-tab redirect in that case.
      const isMobileSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      let popup: Window | null = null;
      if (!isMobileSafari) {
        popup = window.open("about:blank", "c2_oauth", "width=520,height=620,left=200,top=100");
      }

      const res = await c2Connect({ user_id: user.id });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (popup && !popup.closed) {
        // Desktop: navigate the already-open popup to the auth URL
        popup.location.href = data.url;
      } else {
        // Mobile Safari or popup was blocked: full-page redirect, callback returns to same tab
        window.location.href = data.url;
      }
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
