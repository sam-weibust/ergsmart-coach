/// <reference types="vite/client" />

import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY as API_KEY } from "@/config/supabase";

const BASE_URL = `${SUPABASE_URL}/functions/v1`;

export function getApiUrl(path: string): string {
  if (typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform()) {
    return `https://crewsync.app${path}`;
  }
  return path;
}

// Failsafe 3: de-dupe identical in-flight AI requests so a double-tap or a
// re-render can never fire (and pay for) the same call twice.
const inFlightCalls = new Map<string, Promise<Response>>();

async function callFunction(name: string, body: object): Promise<Response> {
  let dedupeKey: string;
  try {
    dedupeKey = `${name}::${JSON.stringify(body)}`;
  } catch {
    dedupeKey = name;
  }
  const existing = inFlightCalls.get(dedupeKey);
  if (existing) {
    console.log(`[api] callFunction DEDUPED: ${name}`);
    // Return a fresh clone so each caller can read the body independently.
    return existing.then((res) => res.clone());
  }

  const promise = callFunctionInner(name, body).finally(() => {
    inFlightCalls.delete(dedupeKey);
  });
  inFlightCalls.set(dedupeKey, promise);
  return promise.then((res) => res.clone());
}

async function callFunctionInner(name: string, body: object): Promise<Response> {
  console.log(`[api] callFunction START: ${name}, native: ${Capacitor.isNativePlatform()}`);
  const url = `${BASE_URL}/${name}?_t=${Date.now()}`;
  console.log(`[api] fetching URL: ${url}`);

  // On native iOS the WKWebView can fail on supabase.auth.getSession() before
  // the fetch even starts. Use the anon key directly — the same approach that
  // nativeFetch in WhoopConnectSection uses and which is known to work.
  let bearerToken = API_KEY;
  if (!Capacitor.isNativePlatform()) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) bearerToken = session.access_token;
    } catch {}
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": API_KEY,
        "Authorization": `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    console.error(`[api] fetch THREW for ${name}:`, err?.message, err?.stack, err);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`[api] Function ${name} failed (${res.status}):`, text);
    throw new Error(`Function ${name} returned ${res.status}`);
  }

  console.log(`[api] callFunction OK: ${name} (${res.status})`);
  return res;
}

// Shared helper for components that do their own direct edge function fetches.
// On native iOS, skips getSession() (which can fail in WKWebView) and uses
// the anon key directly — the same pattern that nativeFetch in WhoopConnectSection uses.
export async function edgeFetch(fnName: string, body: object): Promise<Response> {
  return callFunction(fnName, body);
}

export function generateWorkout(payload: object) {
  return callFunction("generate-workout", payload);
}

export interface WorkoutStreamCallbacks {
  onProgress?: (info: {
    phase: string;
    chunkStart?: number;
    chunkEnd?: number;
    weeksSoFar?: number;
    totalWeeks?: number;
    chars?: number;
    attempt?: number;
  }) => void;
  onChunk?: (info: {
    weeks: any[];
    chunkStart: number;
    chunkEnd: number;
    weeksSoFar: number;
    totalWeeks: number;
  }) => void;
}

// Consume the generate-workout Server-Sent Events stream. The edge function
// streams each 4-week chunk as it completes (never idling past the 150s
// timeout) and ends with a `done` event carrying the full plan. A cache hit or
// an early validation error comes back as a plain JSON body instead — handled
// transparently. Resolves with the complete plan object ({ plan: [...] }).
export async function generateWorkoutStream(
  payload: object,
  cb: WorkoutStreamCallbacks = {},
): Promise<any> {
  const url = `${BASE_URL}/generate-workout?_t=${Date.now()}`;

  let bearerToken = API_KEY;
  if (!Capacitor.isNativePlatform()) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) bearerToken = session.access_token;
    } catch {}
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": API_KEY,
      "Authorization": `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(payload),
  });

  const contentType = res.headers.get("Content-Type") || "";

  // Non-streaming response: cache hit (200 JSON) or an early error (4xx/5xx JSON).
  if (!contentType.includes("text/event-stream")) {
    let json: any = null;
    try { json = await res.json(); } catch {}
    if (json?.error) throw new Error(json.error);
    if (!res.ok) throw new Error(`Function generate-workout returned ${res.status}`);
    return json;
  }

  if (!res.body) throw new Error("Plan generation stream unavailable. Please try again.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: any = null;
  let streamError: string | null = null;

  const handle = (event: string, data: any) => {
    if (event === "progress") cb.onProgress?.(data);
    else if (event === "chunk") cb.onChunk?.(data);
    else if (event === "done") done = data;
    else if (event === "error") streamError = data?.error || "Plan generation failed. Please try again.";
  };

  while (true) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      let dataStr = "";
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      try { handle(event, JSON.parse(dataStr)); } catch {}
    }
  }

  if (streamError) throw new Error(streamError);
  if (!done) throw new Error("Plan generation did not complete. Please try again.");
  return done;
}

export function generateMeals(payload: object) {
  return callFunction("generate-meals", payload);
}

export function generateRecruitEmails(payload: object) {
  return callFunction("generate-recruit-emails", payload);
}

export function predictRecruitment(payload: object) {
  return callFunction("predict-recruitment", payload);
}

export function critiqueRowing(payload: object) {
  return callFunction("critique-rowing", payload);
}

export function analyzeWorkout(payload: object) {
  return callFunction("analyze-workout", payload);
}

export function parseErgScreen(payload: object) {
  return callFunction("parse-erg-screen", payload);
}

export function parseWorkoutImage(payload: object) {
  return callFunction("parse-workout-image", payload);
}

export function parseNutritionLabel(payload: object) {
  return callFunction("parse-nutrition-label", payload);
}

export function c2LogbookAuth(payload: object) {
  return callFunction("c2-logbook-auth", payload);
}

export function c2LogbookSync() {
  return callFunction("c2-logbook-sync", {});
}

export function createNotification(payload: object) {
  return callFunction("create-notification", payload);
}

export function c2Connect(payload: object) {
  return callFunction("c2-connect", payload);
}

export function c2Callback(payload: object) {
  return callFunction("c2-callback", payload);
}

export function c2Disconnect(payload: object) {
  return callFunction("c2-disconnect", payload);
}

export function c2Sync(payload: object) {
  return callFunction("sync-concept2", payload);
}

export function whoopConnect(payload: object) {
  return callFunction("whoop-connect", payload);
}

export function whoopCallback(payload: object) {
  return callFunction("whoop-callback", payload);
}

export function whoopSync(payload: object) {
  return callFunction("sync-whoop", payload);
}

export function whoopDisconnect(payload: object) {
  return callFunction("whoop-disconnect", payload);
}
