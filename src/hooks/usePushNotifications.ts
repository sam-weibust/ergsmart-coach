import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";

async function storeToken(token: string, platform: "ios" | "android") {
  const user = await getSessionUser();
  if (!user) return;
  await supabase.from("push_tokens" as any).upsert(
    { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
    { onConflict: "user_id,token" }
  );
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

        if (status === "prompt" || status === "prompt-with-rationale") {
          const result = await PushNotifications.requestPermissions();
          status = result.receive;
        }

        if (status !== "granted") return;

        await PushNotifications.register();

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
