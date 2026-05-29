import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";

async function storeToken(token: string, platform: "ios" | "android") {
  const user = await getSessionUser();
  if (!user) {
    console.warn("[Push] storeToken: no session user, skipping");
    return;
  }
  console.log("[Push] storing token for user:", user.id, "platform:", platform);
  const { error } = await supabase.from("push_tokens" as any).upsert(
    { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
    { onConflict: "user_id,token" }
  );
  console.log("[Push] token save result:", error ? "ERROR: " + error.message : "OK");
}

export function usePushNotifications() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const platform = Capacitor.getPlatform() as "ios" | "android";

        const { receive: permStatus } = await PushNotifications.checkPermissions();
        let status = permStatus;

        console.log("[Push] permission status:", status);
        if (status === "prompt" || status === "prompt-with-rationale") {
          const result = await PushNotifications.requestPermissions();
          status = result.receive;
          console.log("[Push] permission after request:", status);
        }

        if (status !== "granted") {
          console.log("[Push] permission not granted, aborting");
          return;
        }

        await PushNotifications.register();
        console.log("[Push] registered with APNs/FCM");

        const regListener = await PushNotifications.addListener("registration", async (token) => {
          await storeToken(token.value, platform);
        });

        const errListener = await PushNotifications.addListener("registrationError", (err) => {
          console.error("[PushNotifications] registration error:", err);
        });

        cleanup = () => {
          regListener.remove();
          errListener.remove();
        };
      } catch (e) {
        console.error("[usePushNotifications]", e);
      }
    })();

    return () => cleanup?.();
  }, []);
}
