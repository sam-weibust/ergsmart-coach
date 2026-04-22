import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { EmailNotificationSettings } from "./EmailNotificationSettings";
import { getSessionUser } from '@/lib/getUser';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

// This would be your VAPID public key - for now we'll check if push is supported
const VAPID_PUBLIC_KEY = ""; // Will be set when you configure web push

export const NotificationSettings = () => {
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPushSupported("Notification" in window && "serviceWorker" in navigator);
    if ("Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const { data: subscription } = useQuery({
    queryKey: ["push-subscription"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;

      const { data } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      return data;
    },
  });

  const enablePush = useMutation({
    mutationFn: async () => {
      if (!pushSupported) throw new Error("Push notifications not supported");

      // Request permission
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== "granted") {
        throw new Error("Permission denied for notifications");
      }

      // For a full implementation, you'd:
      // 1. Register a service worker
      // 2. Subscribe to push manager with VAPID key
      // 3. Store the subscription in the database

      // For now, we'll just show in-app notifications
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      // Store a placeholder subscription to indicate enabled
      const { error } = await supabase.from("push_subscriptions").insert({
        user_id: user.id,
        endpoint: "in-app",
        p256dh: "in-app",
        auth: "in-app",
      });

      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Notifications Enabled",
        description: "You'll receive in-app notifications for important updates",
      });
      queryClient.invalidateQueries({ queryKey: ["push-subscription"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disablePush = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Notifications Disabled" });
      queryClient.invalidateQueries({ queryKey: ["push-subscription"] });
    },
  });

  const isEnabled = !!subscription;

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </CardTitle>
        <CardDescription>
          Configure how you receive notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Receive alerts for workouts, messages, and friend requests
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) => {
              if (checked) {
                enablePush.mutate();
              } else {
                disablePush.mutate();
              }
            }}
            disabled={enablePush.isPending || disablePush.isPending}
          />
        </div>

        {!pushSupported && (
          <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 p-3 rounded-lg">
            <BellOff className="h-4 w-4" />
            <p>Your browser doesn't support push notifications. In-app notifications will still work.</p>
          </div>
        )}

        {pushPermission === "denied" && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
            <BellOff className="h-4 w-4" />
            <p>Notifications are blocked. Please enable them in your browser settings.</p>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium">You'll be notified about:</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Daily workout reminders</li>
            <li>• New friend and coach requests</li>
            <li>• Messages from friends and teams</li>
            <li>• When someone shares a plan with you</li>
          </ul>
        </div>
      </CardContent>
    </Card>
    <EmailNotificationSettings />
    </div>
  );
};
