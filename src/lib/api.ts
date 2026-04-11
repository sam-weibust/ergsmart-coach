import { supabase } from "@/integrations/supabase/client";

// -----------------------------
// Shared Helpers
// -----------------------------
export async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

export async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token}`,
    "Content-Type": "application/json",
  };
}

const baseUrl = import.meta.env.VITE_SUPABASE_URL;

// -----------------------------
// 1. Chat — chat-rowing
// -----------------------------
export async function callChatRowing(messages) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/chat-rowing`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, messages }),
  });

  return res.json();
}

// -----------------------------
// 2. Generate Workout
// -----------------------------
export async function callGenerateWorkout(input) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/generate-workout`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, ...input }),
  });

  return res.json();
}

// -----------------------------
// 3. Generate Strength
// -----------------------------
export async function callGenerateStrength(input) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/generate-strength`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, ...input }),
  });

  return res.json();
}

// -----------------------------
// 4. Generate Meals
// -----------------------------
export async function callGenerateMeals(input) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/generate-meals`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, ...input }),
  });

  return res.json();
}

// -----------------------------
// 5. Predict Recruitment
// -----------------------------
export async function callPredictRecruitment(input) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/predict-recruitment`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, ...input }),
  });

  return res.json();
}

// -----------------------------
// 6. Generate Recruit Emails
// -----------------------------
export async function callGenerateRecruitEmails(input) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/generate-recruit-emails`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, ...input }),
  });

  return res.json();
}

// -----------------------------
// 7. Parse Image
// -----------------------------
export async function callParseImage(base64) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/parse-image`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, image: base64 }),
  });

  return res.json();
}

// -----------------------------
// 8. Parse CSV
// -----------------------------
export async function callParseCSV(csvText) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/parse-csv`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, csv: csvText }),
  });

  return res.json();
}

// -----------------------------
// 9. Concept2 Auth
// -----------------------------
export async function callConcept2Auth(code) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/concept2-auth`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, code }),
  });

  return res.json();
}

// -----------------------------
// 10. Concept2 Sync
// -----------------------------
export async function callConcept2Sync() {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/concept2-sync`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id }),
  });

  return res.json();
}

// -----------------------------
// 11. Create Notification
// -----------------------------
export async function callCreateNotification(input) {
  const user_id = await getUserId();

  const res = await fetch(`${baseUrl}/functions/v1/create-notification`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify({ user_id, ...input }),
  });

  return res.json();
}
