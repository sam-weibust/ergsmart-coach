/// <reference types="vite/client" />

import { supabase } from "@/integrations/supabase/client";

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${BASE_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: API_KEY,
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Function ${name} failed:`, text);
    throw new Error(`Function ${name} returned ${res.status}`);
  }

  return res;
}

export function generateWorkout(payload) {
  return callFunction("generate-workout", payload);
}

export function generateMeals(payload) {
  return callFunction("generate-meals", payload);
}

export function generateRecruitEmails(payload) {
  return callFunction("generate-recruit-emails", payload);
}

export function predictRecruitment(payload) {
  return callFunction("predict-recruitment", payload);
}

export function critiqueRowing(payload) {
  return callFunction("critique-rowing", payload);
}

export function analyzeWorkout(payload) {
  return callFunction("analyze-workout", payload);
}

export function parseErgScreen(payload) {
  return callFunction("parse-erg-screen", payload);
}

export function parseWorkoutImage(payload) {
  return callFunction("parse-workout-image", payload);
}

export function parseNutritionLabel(payload) {
  return callFunction("parse-nutrition-label", payload);
}

export function c2LogbookAuth(payload) {
  return callFunction("c2-logbook-auth", payload);
}

export function c2LogbookSync(payload) {
  return callFunction("c2-logbook-sync", payload);
}

export function createNotification(payload) {
  return callFunction("create-notification", payload);
}
