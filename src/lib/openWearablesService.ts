/**
 * Wearable integration client-side service.
 * All provider OAuth and data-fetch logic runs in Supabase Edge Functions.
 * This module provides typed helpers for the frontend to invoke those functions.
 */
import { supabase } from "@/integrations/supabase/client";

export const SUPPORTED_PROVIDERS = [
  { id: "garmin",  label: "Garmin" },
  { id: "whoop",   label: "WHOOP" },
  { id: "oura",    label: "Oura Ring" },
  { id: "apple",   label: "Apple Health" },
  { id: "strava",  label: "Strava" },
  { id: "polar",   label: "Polar" },
  { id: "fitbit",  label: "Fitbit" },
] as const;

export type WearableProvider = typeof SUPPORTED_PROVIDERS[number]["id"];

export interface WearableConnection {
  id: string;
  user_id: string;
  provider: WearableProvider;
  open_wearables_user_id: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  connected_at: string;
  error_message: string | null;
}

/** Opens the provider OAuth flow in a popup window. Requires provider to be specified. */
export async function connectWearable(
  userId: string,
  provider?: WearableProvider
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("wearable-connect", {
    body: { user_id: userId, provider },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error("No connect URL returned");
  window.open(data.url, "_blank", "width=640,height=720,noopener,noreferrer");
}

/** Trigger a 7-day backfill sync for all connected providers. */
export async function syncWearables(userId: string, days = 7): Promise<{
  synced: string[];
  errors: string[];
}> {
  const { data, error } = await supabase.functions.invoke("wearable-sync", {
    body: { user_id: userId, days },
  });
  if (error) throw new Error(error.message);
  return data;
}

/** Fetch the user's wearable connections from Supabase. */
export async function getConnections(userId: string): Promise<WearableConnection[]> {
  const { data, error } = await supabase
    .from("wearable_connections")
    .select("id,user_id,provider,open_wearables_user_id,is_active,last_sync_at,connected_at,error_message")
    .eq("user_id", userId)
    .order("connected_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as WearableConnection[];
}

/** Returns the human-readable label for a provider id. */
export function providerLabel(provider: string): string {
  return SUPPORTED_PROVIDERS.find(p => p.id === provider)?.label ?? provider;
}
