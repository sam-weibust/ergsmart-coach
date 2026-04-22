import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2 } from "lucide-react";
import { getSessionUser } from '@/lib/getUser';

type PreferenceKey =
  | "friend_request"
  | "friend_accepted"
  | "team_board_post"
  | "coach_viewed_profile"
  | "new_pr"
  | "weekly_challenge"
  | "training_plan_updated";

const EMAIL_TYPES: { key: PreferenceKey; label: string; description: string }[] = [
  {
    key: "friend_request",
    label: "Friend Requests",
    description: "When someone sends you a friend request",
  },
  {
    key: "friend_accepted",
    label: "Friend Accepted",
    description: "When someone accepts your friend request",
  },
  {
    key: "team_board_post",
    label: "Team Board Posts",
    description: "New posts in your team message board",
  },
  {
    key: "coach_viewed_profile",
    label: "Coach Profile Views",
    description: "When a college coach follows your recruiting profile",
  },
  {
    key: "new_pr",
    label: "New Personal Records",
    description: "When a new PR is detected after a workout sync",
  },
  {
    key: "weekly_challenge",
    label: "Weekly Challenges",
    description: "When a new weekly challenge starts every Monday",
  },
  {
    key: "training_plan_updated",
    label: "Training Plan Updates",
    description: "When your coach shares or updates a training plan",
  },
];

const DEFAULT_PREFS: Record<PreferenceKey, boolean> = {
  friend_request: true,
  friend_accepted: true,
  team_board_post: true,
  coach_viewed_profile: true,
  new_pr: true,
  weekly_challenge: true,
  training_plan_updated: true,
};

export const EmailNotificationSettings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["email-notification-prefs"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;

      const { data } = await supabase
        .from("notification_preferences" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      return data ?? null;
    },
  });

  const updatePref = useMutation({
    mutationFn: async ({ key, value }: { key: PreferenceKey; value: boolean }) => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from("notification_preferences" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("notification_preferences" as any)
          .update({ [key]: value, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_preferences" as any)
          .insert({ user_id: user.id, [key]: value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-notification-prefs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getValue = (key: PreferenceKey): boolean => {
    if (!prefs) return DEFAULT_PREFS[key];
    const val = (prefs as any)[key];
    return val === null || val === undefined ? DEFAULT_PREFS[key] : val;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Notifications
        </CardTitle>
        <CardDescription>
          Choose which events trigger an email. You can also unsubscribe from any email using the link in the footer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preferences…
          </div>
        ) : (
          EMAIL_TYPES.map(({ key, label, description }) => (
            <div
              key={key}
              className="flex items-center justify-between py-3 border-b border-border last:border-0"
            >
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">{label}</Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={getValue(key)}
                onCheckedChange={(checked) => updatePref.mutate({ key, value: checked })}
                disabled={updatePref.isPending}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
