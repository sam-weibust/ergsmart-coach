import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MESSAGES_7 = [
  { title: "Your erg misses you", body: "Your erg misses you. It has been 7 days. Get back on track today." },
  { title: "The leaderboard is moving", body: "The leaderboard is moving without you. Log a workout and reclaim your spot." },
  { title: "One week off", body: "One week off is a rest. Two weeks off is losing fitness. Log something today." },
  { title: "Your streak is recoverable", body: "Your training streak is recoverable. But only if you row today." },
  { title: "Every champion has a week like this", body: "Every champion has a week they almost quit. Do not let this be yours." },
];

const MESSAGES_14 = [
  { title: "Come back to CrewSync", body: "It has been 2 weeks since your last workout. Your fitness is slipping. Ten minutes on the erg today is all it takes." },
  { title: "Two weeks off", body: "Two weeks without rowing. Your aerobic base is fading. One session today changes everything." },
  { title: "Come back to CrewSync", body: "14 days off the erg. Your competitors are not taking the same break. Row today." },
];

interface PushToken {
  token: string;
  platform: string;
  user_id: string;
}

let apnsTokenCache: { token: string; expiry: number } | null = null;

async function getApnsJwt(keyId: string, teamId: string, privateKey: string): Promise<string> {
  if (apnsTokenCache && Date.now() < apnsTokenCache.expiry) return apnsTokenCache.token;

  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };

  const enc = (obj: object) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemBody = privateKey.replace(/-----BEGIN EC PRIVATE KEY-----|-----END EC PRIVATE KEY-----|\n/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sigBytes = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sigB64}`;
  apnsTokenCache = { token: jwt, expiry: Date.now() + 2900 * 1000 };
  return jwt;
}

async function sendApns(token: string, title: string, body: string, apnsKeyId: string, apnsTeamId: string, apnsPrivKey: string, bundleId: string): Promise<boolean> {
  try {
    const jwt = await getApnsJwt(apnsKeyId, apnsTeamId, apnsPrivKey);
    const resp = await fetch(`https://api.push.apple.com/3/device/${token}`, {
      method: "POST",
      headers: {
        "authorization": `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "content-type": "application/json",
      },
      body: JSON.stringify({ aps: { alert: { title, body }, sound: "default", badge: 1 } }),
    });
    if (resp.status === 410 || resp.status === 400) return false; // invalid token
    return resp.ok;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const apnsKeyId = Deno.env.get("APNS_KEY_ID") ?? "";
    const apnsTeamId = Deno.env.get("APNS_TEAM_ID") ?? "";
    const apnsPrivKey = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
    const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "com.crewsync.app";

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fourteenDaysAgoDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Find users with push tokens and their last workout date
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("user_id, token, platform")
      .eq("platform", "ios");

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No iOS tokens found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userIds = [...new Set(tokens.map((t: PushToken) => t.user_id))];

    // Get last workout date for each user (erg, strength, or cross training)
    const [ergRes, strengthRes, crossRes] = await Promise.all([
      supabase.from("erg_workouts").select("user_id, workout_date").in("user_id", userIds).order("workout_date", { ascending: false }),
      supabase.from("strength_workouts").select("user_id, workout_date").in("user_id", userIds).order("workout_date", { ascending: false }),
      supabase.from("cross_training_workouts").select("user_id, workout_date").in("user_id", userIds).order("workout_date", { ascending: false }).limit(userIds.length * 5),
    ]);

    // Build last workout map
    const lastWorkout: Record<string, string> = {};
    for (const w of [...(ergRes.data || []), ...(strengthRes.data || []), ...(crossRes.data || [])]) {
      const uid = (w as any).user_id;
      const date = (w as any).workout_date;
      if (!lastWorkout[uid] || date > lastWorkout[uid]) lastWorkout[uid] = date;
    }

    // Get notification preferences (training_reminders)
    const { data: notifPrefs } = await supabase
      .from("notification_preferences")
      .select("user_id, training_reminders")
      .in("user_id", userIds);

    const remindersOff = new Set(
      (notifPrefs || []).filter((p: any) => p.training_reminders === false).map((p: any) => p.user_id)
    );

    // Get recent reengagement sends to avoid double-notifying
    const { data: recentSends } = await supabase
      .from("reengagement_notifications")
      .select("user_id, sent_at")
      .in("user_id", userIds)
      .gte("sent_at", sevenDaysAgo);

    const recentlySent = new Set((recentSends || []).map((r: any) => r.user_id));

    let sentCount = 0;
    const insertRows: Array<{ user_id: string; days_inactive: number; message_variant: number }> = [];

    for (const uid of userIds) {
      if (remindersOff.has(uid)) continue;
      if (recentlySent.has(uid)) continue;

      const last = lastWorkout[uid];
      let daysInactive = 999;
      if (last) {
        daysInactive = Math.floor((now.getTime() - new Date(last).getTime()) / (24 * 60 * 60 * 1000));
      }

      // 14-day notification takes priority over 7-day
      let msgPool: typeof MESSAGES_7 | null = null;
      let daysLabel = 0;
      if (daysInactive >= 14) {
        msgPool = MESSAGES_14;
        daysLabel = 14;
      } else if (daysInactive >= 7) {
        msgPool = MESSAGES_7;
        daysLabel = 7;
      }

      if (!msgPool) continue;

      const variant = Math.floor(Math.random() * msgPool.length);
      const { title, body } = msgPool[variant];

      // Get all tokens for this user
      const userTokens = tokens.filter((t: PushToken) => t.user_id === uid);
      for (const pt of userTokens) {
        if (pt.platform === "ios" && apnsKeyId) {
          const ok = await sendApns(pt.token, title, body, apnsKeyId, apnsTeamId, apnsPrivKey, bundleId);
          if (!ok) {
            // Remove invalid token
            await supabase.from("push_tokens").delete().eq("token", pt.token);
          }
        }
      }

      insertRows.push({ user_id: uid, days_inactive: daysLabel, message_variant: variant + 1 });
      sentCount++;
    }

    if (insertRows.length > 0) {
      await supabase.from("reengagement_notifications").insert(insertRows);
    }

    console.log(`send-reengagement-notifications: sent ${sentCount} notifications`);
    return new Response(JSON.stringify({ sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-reengagement-notifications: error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
