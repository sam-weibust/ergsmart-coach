import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";

/**
 * Token received from APNs/FCM but not yet persisted because nobody was signed
 * in when it arrived. push_tokens is RLS'd to `user_id = auth.uid()`, so the row
 * can only be written once a session exists.
 *
 * This hook mounts in AppRouter, i.e. before the user logs in, so the very first
 * registration callback almost always lands pre-auth. Previously that token was
 * logged and dropped, the effect never re-ran, and push_tokens stayed empty
 * forever — which is exactly what we saw in production (0 rows project-wide).
 */
let pendingToken: { token: string; platform: "ios" | "android" } | null = null;

async function storeToken(token: string, platform: "ios" | "android"): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) {
    console.log("[Push] no session yet — holding token until sign-in");
    pendingToken = { token, platform };
    return false;
  }
  console.log("[Push] storing token for user:", user.id, "platform:", platform);
  const { error } = await supabase.from("push_tokens" as any).upsert(
    { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
    { onConflict: "user_id,token" }
  );
  if (error) {
    // Keep it queued so the next auth event retries rather than losing it.
    pendingToken = { token, platform };
    console.error("[Push] token save FAILED:", error.message);
    return false;
  }
  pendingToken = null;
  console.log("[Push] token saved OK");
  return true;
}

async function flushPendingToken() {
  if (!pendingToken) return;
  const { token, platform } = pendingToken;
  console.log("[Push] flushing held token after auth change");
  await storeToken(token, platform);
}

export function usePushNotifications() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const platform = Capacitor.getPlatform() as "ios" | "android";

        // Attach listeners BEFORE register(). The `registration` event can fire
        // synchronously off register() on iOS, so registering first raced the
        // listener and silently lost the token.
        const regListener = await PushNotifications.addListener("registration", async (token) => {
          console.log("[Push] registration event, token length:", token.value?.length ?? 0);
          await storeToken(token.value, platform);
        });

        const errListener = await PushNotifications.addListener("registrationError", (err) => {
          console.error("[Push] registration error:", JSON.stringify(err));
        });

        // Persist the token once the user signs in, since the callback above
        // usually arrives while still unauthenticated.
        const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
          if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
            void flushPendingToken();
          }
        });

        const { receive: permStatus } = await PushNotifications.checkPermissions();
        let status = permStatus;
        console.log("[Push] permission status:", status);

        if (status === "prompt" || status === "prompt-with-rationale") {
          const result = await PushNotifications.requestPermissions();
          status = result.receive;
          console.log("[Push] permission after request:", status);
        }

        if (status !== "granted") {
          console.log("[Push] permission not granted, aborting registration");
        } else {
          await PushNotifications.register();
          console.log("[Push] register() called, awaiting registration event");
        }

        cleanup = () => {
          regListener.remove();
          errListener.remove();
          authSub.subscription.unsubscribe();
        };
      } catch (e) {
        console.error("[usePushNotifications]", e);
      }
    })();

    return () => cleanup?.();
  }, []);
}
