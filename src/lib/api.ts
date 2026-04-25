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

async function callFunction(name: string, body: object) {
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

export function c2LogbookSync(payload: object) {
  return callFunction("c2-logbook-sync", payload);
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
