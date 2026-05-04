import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bell, Loader2 } from "lucide-react";
import { EmailNotificationSettings } from "./EmailNotificationSettings";
import { getSessionUser } from "@/lib/getUser";

const PREF_ITEMS = [
  { key: "lineup_published", label: "Lineup published", description: "When a coach posts your boat lineup" },
  { key: "practice_reminder", label: "Practice reminders", description: "Morning reminder on practice days" },
  { key: "direct_message", label: "Direct messages", description: "When a coach sends you a private message" },
  { key: "team_board_post", label: "Team board posts", description: "When a coach posts to the team board" },
  { key: "personal_best", label: "Personal bests", description: "When you set a new erg PR" },
  { key: "whoop_low_recovery", label: "Low recovery alerts", description: "When your WHOOP recovery is below 33" },
  { key: "weekly_challenge", label: "Weekly challenge", description: "New weekly challenge announcements" },
  { key: "friend_request", label: "Friend requests", description: "Connection requests and acceptances" },
];

const DEFAULT_PREFS: Record<string, boolean> = {
  lineup_published: true,
  practice_reminder: true,
  direct_message: true,
  team_board_post: true,
  personal_best: true,
  whoop_low_recovery: true,
  weekly_challenge: true,
  friend_request: true,
};

export const NotificationSettings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const updatePref = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("notification_preferences").upsert(
        { user_id: user.id, [key]: value, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>
            Choose which notifications you receive. Push notifications are sent to your device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            PREF_ITEMS.map(({ key, label, description }) => {
              const checked = prefs ? (prefs as any)[key] ?? DEFAULT_PREFS[key] : DEFAULT_PREFS[key];
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{label}</Label>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                  <Switch
                    checked={checked !== false}
                    onCheckedChange={(v) => updatePref.mutate({ key, value: v })}
                    disabled={updatePref.isPending}
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      <EmailNotificationSettings />
    </div>
  );
};
