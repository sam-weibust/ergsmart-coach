/**
 * Direct provider OAuth + API layer.
 * Replaces the Open Wearables aggregator with per-provider integrations.
 *
 * Required env vars per provider:
 *   Strava:  STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
 *   Oura:    OURA_CLIENT_ID, OURA_CLIENT_SECRET
 *   WHOOP:   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET
 *   Fitbit:  FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET
 *   Polar:   POLAR_CLIENT_ID, POLAR_CLIENT_SECRET
 *
 * The OAuth redirect_uri must be registered in each provider's developer console:
 *   ${SUPABASE_URL}/functions/v1/wearable-callback
 */

export const SUPPORTED_PROVIDERS = [
  "garmin", "whoop", "oura", "apple", "strava", "polar", "fitbit",
] as const;
export type Provider = typeof SUPPORTED_PROVIDERS[number];

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

// ── Date utilities ────────────────────────────────────────────────────────────

export function utcToLocalDate(isoString: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(isoString));
  } catch { return isoString.split("T")[0]; }
}

/** Sleep ending before 14:00 local → logged against the start date (previous night). */
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

// ── Normalized types ──────────────────────────────────────────────────────────

export interface NormalizedSleep {
  session_id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  sleep_score?: number;   // 0-100
  efficiency?: number;    // 0-1
  hrv_rmssd?: number;
  resting_hr?: number;
}

export interface NormalizedDaily {
  date: string;           // YYYY-MM-DD
  hrv_rmssd?: number;
  resting_hr?: number;
  readiness_score?: number;
  steps?: number;
  active_calories?: number;
  strain?: number;
}

export interface NormalizedWorkout {
  workout_id: string;
  type: string;
  start_time: string;
  duration_seconds: number;
  distance_meters?: number;
  calories?: number;
  avg_hr?: number;
  strain?: number;
}

export interface TokenResult {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;          // ISO timestamp
  provider_user_id?: string;
}

// ── OAuth state encoding ──────────────────────────────────────────────────────

export function encodeState(userId: string, provider: Provider): string {
  return btoa(`${userId}|${provider}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function decodeState(state: string): { userId: string; provider: Provider } | null {
  try {
    // Re-add base64 padding
    const padded = state.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded + "==".slice(0, (4 - padded.length % 4) % 4));
    const idx = decoded.indexOf("|");
    if (idx < 0) return null;
    const userId = decoded.slice(0, idx);
    const provider = decoded.slice(idx + 1) as Provider;
    if (!SUPPORTED_PROVIDERS.includes(provider)) return null;
    return { userId, provider };
  } catch { return null; }
}

// ── OAuth URL builders ────────────────────────────────────────────────────────

export function getOAuthUrl(provider: Provider, redirectUri: string, state: string): string {
  switch (provider) {
    case "strava": {
      const clientId = Deno.env.get("STRAVA_CLIENT_ID") ?? "";
      if (!clientId) throw new Error("STRAVA_CLIENT_ID not configured");
      return `https://www.strava.com/oauth/authorize?${new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri,
        response_type: "code", scope: "read,activity:read_all", state,
      })}`;
    }
    case "oura": {
      const clientId = Deno.env.get("OURA_CLIENT_ID") ?? "";
      if (!clientId) throw new Error("OURA_CLIENT_ID not configured");
      return `https://cloud.ouraring.com/oauth/authorize?${new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri,
        response_type: "code", scope: "daily personal session heartrate workout sleep", state,
      })}`;
    }
    case "whoop": {
      const clientId = Deno.env.get("WHOOP_CLIENT_ID") ?? "";
      if (!clientId) throw new Error("WHOOP_CLIENT_ID not configured");
      return `https://api.prod.whoop.com/oauth/oauth2/auth?${new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri,
        response_type: "code",
        scope: "offline read:sleep read:recovery read:workout read:body_measurement",
        state,
      })}`;
    }
    case "fitbit": {
      const clientId = Deno.env.get("FITBIT_CLIENT_ID") ?? "";
      if (!clientId) throw new Error("FITBIT_CLIENT_ID not configured");
      return `https://www.fitbit.com/oauth2/authorize?${new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri,
        response_type: "code", scope: "sleep heartrate activity", state,
      })}`;
    }
    case "polar": {
      const clientId = Deno.env.get("POLAR_CLIENT_ID") ?? "";
      if (!clientId) throw new Error("POLAR_CLIENT_ID not configured");
      return `https://flow.polar.com/oauth2/authorization?${new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri,
        response_type: "code", scope: "accesslink.read_all", state,
      })}`;
    }
    case "garmin":
      throw new Error("Garmin Connect requires OAuth 1.0a — not supported via web OAuth. Use Strava, Oura, WHOOP, Fitbit, or Polar.");
    case "apple":
      throw new Error("Apple Health is iOS-only — web OAuth is not supported. Use the CrewSync mobile app.");
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// ── Token exchange ────────────────────────────────────────────────────────────

export async function exchangeProviderCode(
  provider: Provider, code: string, redirectUri: string
): Promise<TokenResult> {
  switch (provider) {
    case "strava": {
      const res = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: Deno.env.get("STRAVA_CLIENT_ID"),
          client_secret: Deno.env.get("STRAVA_CLIENT_SECRET"),
          code,
          grant_type: "authorization_code",
        }),
      });
      if (!res.ok) throw new Error(`Strava token exchange failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_at ? new Date(j.expires_at * 1000).toISOString() : undefined,
        provider_user_id: j.athlete?.id != null ? String(j.athlete.id) : undefined,
      };
    }
    case "oura": {
      const res = await fetch("https://api.ouraring.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code, redirect_uri: redirectUri,
          client_id: Deno.env.get("OURA_CLIENT_ID") ?? "",
          client_secret: Deno.env.get("OURA_CLIENT_SECRET") ?? "",
        }).toString(),
      });
      if (!res.ok) throw new Error(`Oura token exchange failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
      };
    }
    case "whoop": {
      const res = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code, redirect_uri: redirectUri,
          client_id: Deno.env.get("WHOOP_CLIENT_ID") ?? "",
          client_secret: Deno.env.get("WHOOP_CLIENT_SECRET") ?? "",
        }).toString(),
      });
      if (!res.ok) throw new Error(`WHOOP token exchange failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
      };
    }
    case "fitbit": {
      const creds = btoa(`${Deno.env.get("FITBIT_CLIENT_ID")}:${Deno.env.get("FITBIT_CLIENT_SECRET")}`);
      const res = await fetch("https://api.fitbit.com/oauth2/token", {
        method: "POST",
        headers: { "Authorization": `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
      });
      if (!res.ok) throw new Error(`Fitbit token exchange failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
        provider_user_id: j.user_id,
      };
    }
    case "polar": {
      const creds = btoa(`${Deno.env.get("POLAR_CLIENT_ID")}:${Deno.env.get("POLAR_CLIENT_SECRET")}`);
      const res = await fetch("https://polarremote.com/v2/oauth2/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${creds}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
      });
      if (!res.ok) throw new Error(`Polar token exchange failed: ${await res.text()}`);
      const j = await res.json();
      const polarUserId = j.x_user_id ? String(j.x_user_id) : undefined;
      // Register user with Polar AccessLink (idempotent — 409 is fine)
      if (polarUserId) {
        await fetch("https://www.polaraccesslink.com/v3/users", {
          method: "POST",
          headers: { "Authorization": `Bearer ${j.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ "member-id": polarUserId }),
        }).catch(() => { /* ignore 409 conflict */ });
      }
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
        provider_user_id: polarUserId,
      };
    }
    default:
      throw new Error(`Token exchange not supported for provider: ${provider}`);
  }
}

// ── Token refresh ─────────────────────────────────────────────────────────────

export async function refreshProviderToken(
  provider: Provider, refreshToken: string
): Promise<TokenResult> {
  switch (provider) {
    case "strava": {
      const res = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: Deno.env.get("STRAVA_CLIENT_ID"),
          client_secret: Deno.env.get("STRAVA_CLIENT_SECRET"),
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!res.ok) throw new Error(`Strava token refresh failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_at ? new Date(j.expires_at * 1000).toISOString() : undefined,
      };
    }
    case "oura": {
      const res = await fetch("https://api.ouraring.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token", refresh_token: refreshToken,
          client_id: Deno.env.get("OURA_CLIENT_ID") ?? "",
          client_secret: Deno.env.get("OURA_CLIENT_SECRET") ?? "",
        }).toString(),
      });
      if (!res.ok) throw new Error(`Oura token refresh failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
      };
    }
    case "whoop": {
      const res = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token", refresh_token: refreshToken,
          client_id: Deno.env.get("WHOOP_CLIENT_ID") ?? "",
          client_secret: Deno.env.get("WHOOP_CLIENT_SECRET") ?? "",
        }).toString(),
      });
      if (!res.ok) throw new Error(`WHOOP token refresh failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
      };
    }
    case "fitbit": {
      const creds = btoa(`${Deno.env.get("FITBIT_CLIENT_ID")}:${Deno.env.get("FITBIT_CLIENT_SECRET")}`);
      const res = await fetch("https://api.fitbit.com/oauth2/token", {
        method: "POST",
        headers: { "Authorization": `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
      });
      if (!res.ok) throw new Error(`Fitbit token refresh failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
      };
    }
    case "polar": {
      const creds = btoa(`${Deno.env.get("POLAR_CLIENT_ID")}:${Deno.env.get("POLAR_CLIENT_SECRET")}`);
      const res = await fetch("https://polarremote.com/v2/oauth2/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${creds}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
      });
      if (!res.ok) throw new Error(`Polar token refresh failed: ${await res.text()}`);
      const j = await res.json();
      return {
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : undefined,
      };
    }
    default:
      throw new Error(`Token refresh not supported for provider: ${provider}`);
  }
}

// ── Provider data dispatchers ─────────────────────────────────────────────────

export async function fetchProviderSleep(
  provider: Provider, accessToken: string, startDate: string, endDate: string
): Promise<NormalizedSleep[]> {
  switch (provider) {
    case "oura":   return fetchOuraSleep(accessToken, startDate, endDate);
    case "whoop":  return fetchWhoopSleep(accessToken, startDate, endDate);
    case "fitbit": return fetchFitbitSleep(accessToken, startDate, endDate);
    case "polar":  return fetchPolarSleep(accessToken, startDate, endDate);
    default:       return [];
  }
}

export async function fetchProviderDaily(
  provider: Provider, accessToken: string, startDate: string, endDate: string
): Promise<NormalizedDaily[]> {
  switch (provider) {
    case "oura":   return fetchOuraDaily(accessToken, startDate, endDate);
    case "whoop":  return fetchWhoopRecovery(accessToken, startDate, endDate);
    case "fitbit": return fetchFitbitDaily(accessToken, startDate, endDate);
    default:       return [];
  }
}

export async function fetchProviderWorkouts(
  provider: Provider, accessToken: string, startDate: string, endDate: string
): Promise<NormalizedWorkout[]> {
  switch (provider) {
    case "strava": return fetchStravaActivities(accessToken, startDate, endDate);
    case "oura":   return fetchOuraWorkouts(accessToken, startDate, endDate);
    case "whoop":  return fetchWhoopWorkouts(accessToken, startDate, endDate);
    case "fitbit": return fetchFitbitActivities(accessToken, startDate, endDate);
    case "polar":  return fetchPolarExercises(accessToken, startDate, endDate);
    default:       return [];
  }
}

// ── Strava ────────────────────────────────────────────────────────────────────

async function fetchStravaActivities(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedWorkout[]> {
  const after = Math.floor(new Date(startDate + "T00:00:00Z").getTime() / 1000);
  const before = Math.floor(new Date(endDate + "T23:59:59Z").getTime() / 1000);
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=50`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Strava activities fetch failed: ${await res.text()}`);
  const activities = await res.json() as any[];
  return activities.map(a => ({
    workout_id: String(a.id),
    type: (a.type ?? a.sport_type ?? "workout").toLowerCase(),
    start_time: a.start_date,
    duration_seconds: a.elapsed_time ?? a.moving_time ?? 0,
    distance_meters: a.distance,
    calories: a.calories,
    avg_hr: a.average_heartrate,
  }));
}

// ── Oura ──────────────────────────────────────────────────────────────────────

async function fetchOuraSleep(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedSleep[]> {
  const res = await fetch(
    `https://api.ouraring.com/v2/usercollection/sleep?start_date=${startDate}&end_date=${endDate}`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Oura sleep fetch failed: ${await res.text()}`);
  const j = await res.json();
  return ((j.data ?? []) as any[]).map(s => ({
    session_id: s.id,
    start_time: s.bedtime_start,
    end_time: s.bedtime_end,
    duration_seconds: s.total_sleep_duration ?? s.time_in_bed ?? 0,
    sleep_score: s.sleep_score,
    efficiency: s.efficiency != null ? s.efficiency / 100 : undefined,
    hrv_rmssd: s.average_hrv,
    resting_hr: s.lowest_heart_rate,
  }));
}

async function fetchOuraDaily(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedDaily[]> {
  const res = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${startDate}&end_date=${endDate}`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Oura daily readiness fetch failed: ${await res.text()}`);
  const j = await res.json();
  return ((j.data ?? []) as any[]).map(d => ({
    date: d.day,
    readiness_score: d.score,
    hrv_rmssd: d.contributors?.hrv_balance,
    resting_hr: d.contributors?.resting_heart_rate,
  }));
}

async function fetchOuraWorkouts(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedWorkout[]> {
  const res = await fetch(
    `https://api.ouraring.com/v2/usercollection/workout?start_date=${startDate}&end_date=${endDate}`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Oura workouts fetch failed: ${await res.text()}`);
  const j = await res.json();
  return ((j.data ?? []) as any[]).map(w => ({
    workout_id: w.id,
    type: (w.activity ?? "workout").toLowerCase(),
    start_time: w.start_datetime,
    duration_seconds: w.duration ?? 0,
    calories: w.calories,
    avg_hr: w.average_heart_rate,
    distance_meters: w.distance,
  }));
}

// ── WHOOP ─────────────────────────────────────────────────────────────────────

async function fetchWhoopSleep(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedSleep[]> {
  const start = new Date(startDate + "T00:00:00Z").toISOString();
  const end = new Date(endDate + "T23:59:59Z").toISOString();
  const res = await fetch(
    `https://api.prod.whoop.com/developer/v1/activity/sleep?start=${start}&end=${end}&limit=25`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`WHOOP sleep fetch failed: ${await res.text()}`);
  const j = await res.json();
  return ((j.records ?? []) as any[]).map(s => ({
    session_id: String(s.id),
    start_time: s.start,
    end_time: s.end,
    duration_seconds: s.score?.stage_summary?.total_in_bed_time_milli != null
      ? Math.floor(s.score.stage_summary.total_in_bed_time_milli / 1000)
      : 0,
    sleep_score: s.score?.sleep_performance_percentage,
    hrv_rmssd: s.score?.hrv_rmssd_milli,
    resting_hr: s.score?.resting_heart_rate,
  }));
}

async function fetchWhoopRecovery(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedDaily[]> {
  const start = new Date(startDate + "T00:00:00Z").toISOString();
  const end = new Date(endDate + "T23:59:59Z").toISOString();
  const res = await fetch(
    `https://api.prod.whoop.com/developer/v1/recovery?start=${start}&end=${end}&limit=25`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`WHOOP recovery fetch failed: ${await res.text()}`);
  const j = await res.json();
  return ((j.records ?? []) as any[])
    .filter((r: any) => r.created_at)
    .map((r: any) => ({
      date: r.created_at.split("T")[0],
      readiness_score: r.score?.recovery_score,
      hrv_rmssd: r.score?.hrv_rmssd_milli,
      resting_hr: r.score?.resting_heart_rate,
    }));
}

async function fetchWhoopWorkouts(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedWorkout[]> {
  const start = new Date(startDate + "T00:00:00Z").toISOString();
  const end = new Date(endDate + "T23:59:59Z").toISOString();
  const res = await fetch(
    `https://api.prod.whoop.com/developer/v1/activity/workout?start=${start}&end=${end}&limit=25`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`WHOOP workouts fetch failed: ${await res.text()}`);
  const j = await res.json();
  return ((j.records ?? []) as any[]).map(w => ({
    workout_id: String(w.id),
    type: w.sport_id != null ? String(w.sport_id) : "workout",
    start_time: w.start,
    duration_seconds: w.end && w.start
      ? Math.floor((new Date(w.end).getTime() - new Date(w.start).getTime()) / 1000)
      : 0,
    calories: w.score?.kilojoule != null ? Math.round(w.score.kilojoule * 0.239006) : undefined,
    avg_hr: w.score?.average_heart_rate,
    strain: w.score?.strain,
  }));
}

// ── Fitbit ────────────────────────────────────────────────────────────────────

async function fetchFitbitSleep(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedSleep[]> {
  const res = await fetch(
    `https://api.fitbit.com/1.2/user/-/sleep/date/${startDate}/${endDate}.json`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Fitbit sleep fetch failed: ${await res.text()}`);
  const j = await res.json();
  return ((j.sleep ?? []) as any[]).map(s => ({
    session_id: String(s.logId),
    start_time: s.startTime,
    end_time: s.endTime ?? s.startTime,
    duration_seconds: Math.floor((s.duration ?? 0) / 1000),
    efficiency: s.efficiency != null ? s.efficiency / 100 : undefined,
    sleep_score: s.efficiency,
  }));
}

async function fetchFitbitDaily(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedDaily[]> {
  const res = await fetch(
    `https://api.fitbit.com/1/user/-/hrv/date/${startDate}/${endDate}.json`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) return []; // HRV not available on all Fitbit devices
  const j = await res.json();
  return ((j.hrv ?? []) as any[]).map(h => ({
    date: h.dateTime,
    hrv_rmssd: h.value?.dailyRmssd ?? h.value?.deepRmssd,
  }));
}

async function fetchFitbitActivities(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedWorkout[]> {
  const res = await fetch(
    `https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${startDate}&sort=asc&limit=25&offset=0`,
    { headers: { "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Fitbit activities fetch failed: ${await res.text()}`);
  const j = await res.json();
  const endMs = new Date(endDate + "T23:59:59Z").getTime();
  return ((j.activities ?? []) as any[])
    .filter((a: any) => new Date(a.startTime).getTime() <= endMs)
    .map((a: any) => ({
      workout_id: String(a.logId),
      type: (a.activityName ?? "workout").toLowerCase(),
      start_time: a.startTime,
      duration_seconds: Math.floor((a.duration ?? 0) / 1000),
      distance_meters: a.distance != null ? a.distance * 1000 : undefined,
      calories: a.calories,
      avg_hr: a.averageHeartRate,
    }));
}

// ── Polar ─────────────────────────────────────────────────────────────────────

async function fetchPolarSleep(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedSleep[]> {
  const res = await fetch(
    `https://www.polaraccesslink.com/v3/users/sleep/date/${startDate}/${endDate}`,
    { headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Polar sleep fetch failed: ${await res.text()}`);
  const j = await res.json();
  return ((j.nights ?? []) as any[]).map(s => ({
    session_id: s.polar_user ?? s.date,
    start_time: s.sleep_start_time ?? `${s.date}T22:00:00Z`,
    end_time: s.sleep_end_time ?? `${s.date}T06:00:00Z`,
    duration_seconds: s.total_sleep_seconds ?? 0,
    sleep_score: s.sleep_score,
    hrv_rmssd: s.hrv_avg_ms,
    resting_hr: s.heart_rate_avg,
  }));
}

async function fetchPolarExercises(
  accessToken: string, startDate: string, endDate: string
): Promise<NormalizedWorkout[]> {
  const res = await fetch(
    "https://www.polaraccesslink.com/v3/exercises",
    { headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Polar exercises fetch failed: ${await res.text()}`);
  const j = await res.json();
  const startMs = new Date(startDate + "T00:00:00Z").getTime();
  const endMs = new Date(endDate + "T23:59:59Z").getTime();
  return ((j.exercises ?? []) as any[])
    .filter((e: any) => {
      const t = new Date(e.start_time ?? e.date ?? 0).getTime();
      return t >= startMs && t <= endMs;
    })
    .map((e: any) => ({
      workout_id: String(e.id),
      type: (e.sport ?? "workout").toLowerCase(),
      start_time: e.start_time ?? e.date,
      duration_seconds: e.duration ? parsePolarDuration(e.duration) : 0,
      distance_meters: e.distance,
      calories: e.calories,
      avg_hr: e.heart_rate?.average,
    }));
}

/** Parse ISO 8601 duration PT1H30M15S → seconds */
function parsePolarDuration(duration: string): number {
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}
