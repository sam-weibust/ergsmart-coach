import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Unlink, Check } from "lucide-react";
import { getSessionUser } from "@/lib/getUser";
import {
  isAvailable,
  requestPermissions,
  syncWorkouts,
  syncHeartRate,
  syncHRV,
  syncSleep,
  syncWeight,
  syncActivity,
} from "@/services/healthkit";

// Apple Health icon — white heart on red background
function AppleHealthIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#FF3B30" />
      <path
        d="M12 18.5C12 18.5 5 13.5 5 9.5C5 7.567 6.567 6 8.5 6C9.668 6 10.703 6.591 11.333 7.5L12 8.5L12.667 7.5C13.297 6.591 14.332 6 15.5 6C17.433 6 19 7.567 19 9.5C19 13.5 12 18.5 12 18.5Z"
        fill="white"
      />
    </svg>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

interface SyncStats {
  workouts: number;
  sleep: number;
  heartRate: number;
  weight: number;
  crossTraining: number;
}

export default function HealthKitConnect() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastStats, setLastStats] = useState<SyncStats | null>(null);

  useEffect(() => {
    isAvailable().then(setAvailable);
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile-healthkit"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, healthkit_connected, healthkit_last_synced")
        .eq("id", user.id)
        .maybeSingle();
      return data as { id: string; healthkit_connected: boolean; healthkit_last_synced: string | null } | null;
    },
  });

  const connected = !!(profile as any)?.healthkit_connected;
  const lastSynced = (profile as any)?.healthkit_last_synced;

  async function runSync(days: number): Promise<SyncStats> {
    const [workouts, heartRates, sleep, weight, activity] = await Promise.all([
      syncWorkouts(days),
      syncHeartRate(days),
      syncSleep(days),
      syncWeight(),
      syncActivity(days),
    ]);
    const hrv = await syncHRV(days);

    const user = await getSessionUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase.functions.invoke("sync-healthkit", {
      body: {
        user_id: user.id,
        workouts,
        heartRates: heartRates.map((h, i) => ({
          ...h,
          hrv_ms: hrv[i]?.hrv_ms ?? null,
        })),
        sleepEntries: sleep,
        weightEntry: weight,
        activityDays: activity,
      },
    });

    if (error) throw new Error(error.message);
    return data?.stats as SyncStats;
  }

  const connectMutation = useMutation({
    mutationFn: async () => {
      const granted = await requestPermissions();
      if (!granted) throw new Error("Permission request failed");
      setSyncing(true);
      return runSync(90);
    },
    onSuccess: (stats) => {
      setSyncing(false);
      setLastStats(stats);
      queryClient.invalidateQueries({ queryKey: ["profile-healthkit"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      const total = stats.workouts + stats.sleep + stats.heartRate;
      toast({
        title: "Apple Health connected",
        description: `Imported ${stats.workouts} workout${stats.workouts !== 1 ? "s" : ""}, ${stats.sleep} sleep record${stats.sleep !== 1 ? "s" : ""}, ${stats.heartRate} heart rate day${stats.heartRate !== 1 ? "s" : ""}.`,
      });
    },
    onError: (e: Error) => {
      setSyncing(false);
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    },
  });

  const syncNowMutation = useMutation({
    mutationFn: () => {
      setSyncing(true);
      return runSync(2);
    },
    onSuccess: (stats) => {
      setSyncing(false);
      setLastStats(stats);
      queryClient.invalidateQueries({ queryKey: ["profile-healthkit"] });
      toast({ title: "Sync complete", description: "Apple Health data updated." });
    },
    onError: (e: Error) => {
      setSyncing(false);
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      await supabase.from("healthkit_heart_rate" as any).delete().eq("user_id", user.id);
      await supabase.from("profiles").update({
        healthkit_connected: false,
        healthkit_last_synced: null,
      } as any).eq("id", user.id);
    },
    onSuccess: () => {
      setLastStats(null);
      queryClient.invalidateQueries({ queryKey: ["profile-healthkit"] });
      toast({ title: "Disconnected from Apple Health" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Not on iOS — don't render anything
  if (available === false) return null;

  // Still checking platform
  if (available === null) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AppleHealthIcon size={22} />
          Apple Health
          {connected && (
            <Badge className="bg-green-500/10 text-green-600 border-green-200 text-xs">
              <Check className="h-3 w-3 mr-1" />Connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {connected ? (
          <>
            <p className="text-sm text-muted-foreground">
              Heart rate, sleep, workouts, and activity are syncing from Apple Health.
            </p>
            {lastSynced && (
              <p className="text-xs text-muted-foreground">
                Last synced: {formatDate(lastSynced)}
              </p>
            )}
            {lastStats && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Workouts", val: lastStats.workouts },
                  { label: "Sleep", val: lastStats.sleep },
                  { label: "HR days", val: lastStats.heartRate },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-muted rounded-lg p-2">
                    <div className="font-bold text-sm">{val}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => syncNowMutation.mutate()}
                disabled={syncing || syncNowMutation.isPending}
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync Now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Unlink className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect Apple Health to sync heart rate, sleep, workouts, and activity data automatically.
            </p>
            <Button
              className="gap-2 bg-[#FF3B30] hover:bg-[#e0352b] text-white"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || syncing}
            >
              {connectMutation.isPending || syncing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <AppleHealthIcon size={16} />}
              Connect Apple Health
            </Button>
            <p className="text-xs text-muted-foreground">
              Reads heart rate, sleep, workouts, weight, and activity. Syncs last 90 days on first connect.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
