import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64url(data: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    bytes = data;
  }
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

let _apnsToken: { token: string; issuedAt: number } | null = null;

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_apnsToken && now - _apnsToken.issuedAt < 3000) return _apnsToken.token;

  const keyId = Deno.env.get("APNS_KEY_ID") ?? "";
  const teamId = Deno.env.get("APNS_TEAM_ID") ?? "";
  const privateKeyPem = Deno.env.get("APNS_PRIVATE_KEY") ?? "";

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: now }));
  const sigInput = `${header}.${payload}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sigBytes = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(sigInput)
  );

  const token = `${sigInput}.${base64url(new Uint8Array(sigBytes))}`;
  _apnsToken = { token, issuedAt: now };
  return token;
}

async function sendApns(token: string, title: string, body: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const bundleId = "com.crewsync.app";
    const jwt = await getApnsJwt();
    const payload = {
      aps: {
        alert: { title, body },
        sound: "default",
        badge: 1,
      },
      ...data,
    };
    const res = await fetch(`https://api.push.apple.com/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 410 || res.status === 400) {
      const err = await res.json().catch(() => ({}));
      console.error("[send-notification] APNs error:", res.status, JSON.stringify(err));
      return false; // token invalid
    }
    return res.ok;
  } catch (e) {
    console.error("[send-notification] APNs exception:", e);
    return true; // don't remove token on network errors
  }
}

async function sendFcm(token: string, title: string, body: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const serverKey = Deno.env.get("FCM_SERVER_KEY") ?? "";
    if (!serverKey) return true;
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: `key=${serverKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: { title, body, sound: "default" },
        data: data as Record<string, string>,
      }),
    });
    const result = await res.json();
    if (result.failure > 0 && result.results?.[0]?.error) {
      const err = result.results[0].error;
      if (err === "NotRegistered" || err === "InvalidRegistration") return false;
    }
    return true;
  } catch (e) {
    console.error("[send-notification] FCM exception:", e);
    return true;
  }
}

// Notification preference column mapping
const prefColumn: Record<string, string> = {
  lineup_published: "lineup_published",
  practice_reminder: "practice_reminder",
  direct_message: "direct_message",
  team_board_post: "team_board_post",
  personal_best: "personal_best",
  whoop_low_recovery: "whoop_low_recovery",
  weekly_challenge: "weekly_challenge",
  new_pr: "personal_best",
  friend_request: "friend_request",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { user_id, user_ids, notify_all, title, body, type, data } = await req.json();
    let recipients: string[];

    if (notify_all) {
      const { data: profiles } = await supabase.from("profiles").select("id");
      recipients = (profiles ?? []).map((p: any) => p.id);
    } else {
      recipients = user_ids ?? (user_id ? [user_id] : []);
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "Missing user_id or user_ids" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!title || !body) {
      return new Response(JSON.stringify({ error: "Missing title or body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prefCol = type ? prefColumn[type] : null;

    // Filter recipients by notification preferences
    let eligibleRecipients = recipients;
    if (prefCol) {
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select(`user_id, ${prefCol}`)
        .in("user_id", recipients);

      const disabledSet = new Set<string>();
      for (const pref of prefs ?? []) {
        if (pref[prefCol] === false) disabledSet.add(pref.user_id);
      }
      eligibleRecipients = recipients.filter(uid => !disabledSet.has(uid));
    }

    // Insert in-app notifications
    if (eligibleRecipients.length > 0) {
      const notifRecords = eligibleRecipients.map(uid => ({
        user_id: uid,
        type: type ?? "general",
        title,
        body,
        data: data ?? null,
        read: false,
      }));
      await supabase.from("notifications").insert(notifRecords);
    }

    // Send push notifications
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("id, user_id, token, platform")
      .in("user_id", eligibleRecipients);

    const invalidTokenIds: string[] = [];
    const extraData = data ?? {};

    await Promise.allSettled(
      (tokens ?? []).map(async (row: any) => {
        let valid = true;
        if (row.platform === "ios") {
          valid = await sendApns(row.token, title, body, extraData);
        } else if (row.platform === "android") {
          valid = await sendFcm(row.token, title, body, extraData);
        }
        if (!valid) invalidTokenIds.push(row.id);
      })
    );

    // Remove invalid tokens
    if (invalidTokenIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", invalidTokenIds);
    }

    return new Response(
      JSON.stringify({ success: true, sent: eligibleRecipients.length, push_sent: (tokens ?? []).length - invalidTokenIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[send-notification] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
