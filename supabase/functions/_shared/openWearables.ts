/**
 * Open Wearables shared service layer.
 * Used by wearable-connect, wearable-callback, wearable-webhook, wearable-sync.
 */

export const OW_BASE = "https://api.openwearables.io/v1";

export const SUPPORTED_PROVIDERS = [
  "garmin", "whoop", "oura", "apple", "strava", "polar", "fitbit",
] as const;
export type OWProvider = typeof SUPPORTED_PROVIDERS[number];

// ── Crypto ────────────────────────────────────────────────────────────────────

async function aesKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY") || "change-me-in-production-32chars!!";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(token: string): Promise<string> {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  const out = new Uint8Array(12 + enc.byteLength);
  out.set(iv);
  out.set(new Uint8Array(enc), 12);
  return btoa(String.fromCharCode(...out));
}

export async function decryptToken(cipher: string): Promise<string> {
  const key = await aesKey();
  const buf = new Uint8Array(atob(cipher).split("").map(c => c.charCodeAt(0)));
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
  return new TextDecoder().decode(dec);
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Open Wearables signs webhooks with HMAC-SHA256.
 * Header: x-open-wearables-signature: sha256=<hex>
 */
export async function verifyWebhookSignature(
  rawBody: string, header: string, secret: string
): Promise<boolean> {
  try {
    const expected = header.startsWith("sha256=") ? header.slice(7) : header;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return computed === expected;
  } catch { return false; }
}

// ── Date utilities ────────────────────────────────────────────────────────────

export function utcToLocalDate(isoString: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(isoString));
  } catch { return isoString.split("T")[0]; }
}

/**
 * "Previous night" rule: sleep that ends before 14:00 local = logged against start date.
 */
export function sleepDate(sleepEndIso: string, timezone: string): string {
  try {
    const hour = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false })
        .format(new Date(sleepEndIso))
    );
    if (hour < 14) {
      const d = new Date(new Date(sleepEndIso).getTime() - 86400000);
      return utcToLocalDate(d.toISOString(), timezone);
    }
  } catch { /* fall through */ }
  return utcToLocalDate(sleepEndIso, timezone);
}

export function localHHMM(isoString: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(isoString));
  } catch { return ""; }
}

// ── Open Wearables API client ─────────────────────────────────────────────────

function owHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${Deno.env.get("OPEN_WEARABLES_API_KEY") ?? ""}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

/** Initiate an OAuth connect session. Returns { auth_url, session_id }. */
export async function createConnectSession(opts: {
  reference_id: string;
  provider?: string;
  success_url: string;
  failure_url: string;
}): Promise<{ auth_url: string; session_id: string }> {
  const res = await fetch(`${OW_BASE}/auth/connect`, {
    method: "POST",
    headers: owHeaders(),
    body: JSON.stringify({
      reference_id: opts.reference_id,
      provider: opts.provider?.toLowerCase(),
      redirect_urls: { success: opts.success_url, failure: opts.failure_url },
    }),
  });
  if (!res.ok) throw new Error(`Open Wearables connect error: ${await res.text()}`);
  return res.json();
}

/** Exchange an OAuth code for tokens. Returns connection details. */
export async function exchangeCode(code: string, session_id?: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  open_wearables_user_id: string;
  provider: string;
}> {
  const res = await fetch(`${OW_BASE}/auth/token`, {
    method: "POST",
    headers: owHeaders(),
    body: JSON.stringify({ code, session_id }),
  });
  if (!res.ok) throw new Error(`Open Wearables token exchange error: ${await res.text()}`);
  return res.json();
}

/** Fetch historical sleep sessions for a user. */
export async function fetchSleep(owUserId: string, startDate: string, endDate: string) {
  const res = await fetch(
    `${OW_BASE}/users/${owUserId}/sleep?start=${startDate}&end=${endDate}`,
    { headers: owHeaders() }
  );
  if (!res.ok) throw new Error(`Open Wearables sleep fetch error: ${await res.text()}`);
  const j = await res.json();
  return (j.data || []) as OWSleepSession[];
}

/** Fetch historical daily summaries for a user. */
export async function fetchDaily(owUserId: string, startDate: string, endDate: string) {
  const res = await fetch(
    `${OW_BASE}/users/${owUserId}/daily?start=${startDate}&end=${endDate}`,
    { headers: owHeaders() }
  );
  if (!res.ok) throw new Error(`Open Wearables daily fetch error: ${await res.text()}`);
  const j = await res.json();
  return (j.data || []) as OWDailySummary[];
}

/** Fetch historical workouts for a user. */
export async function fetchWorkouts(owUserId: string, startDate: string, endDate: string) {
  const res = await fetch(
    `${OW_BASE}/users/${owUserId}/workouts?start=${startDate}&end=${endDate}`,
    { headers: owHeaders() }
  );
  if (!res.ok) throw new Error(`Open Wearables workouts fetch error: ${await res.text()}`);
  const j = await res.json();
  return (j.data || []) as OWWorkout[];
}

// ── Open Wearables payload types ──────────────────────────────────────────────

export interface OWSleepSession {
  session_id: string;
  start_time: string;       // ISO UTC
  end_time: string;         // ISO UTC
  duration_seconds: number;
  sleep_score?: number;     // 0-100
  efficiency?: number;      // 0-1
  hrv_rmssd?: number;       // ms
  resting_hr?: number;      // bpm
}

export interface OWDailySummary {
  date: string;             // YYYY-MM-DD UTC
  hrv_rmssd?: number;
  resting_hr?: number;
  readiness_score?: number; // 0-100
  steps?: number;
  active_calories?: number;
  strain?: number;          // 0-21 WHOOP-style
}

export interface OWWorkout {
  workout_id: string;
  type: string;             // 'rowing', 'cycling', 'running', etc.
  start_time: string;
  duration_seconds: number;
  distance_meters?: number;
  calories?: number;
  avg_hr?: number;
  strain?: number;
}

export interface OWWebhookPayload {
  event: string;            // 'connection.created' | 'sleep.updated' | 'daily.updated' | 'workout.created' | 'connection.error'
  open_wearables_user_id: string;
  reference_id: string;     // our user_id
  provider: string;
  timestamp: string;
  data: OWSleepSession | OWDailySummary | OWWorkout | Record<string, unknown>;
}
