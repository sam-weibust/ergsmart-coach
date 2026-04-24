// Central Supabase config with hardcoded fallbacks.
// On iOS Capacitor, import.meta.env values are inlined at build time by Vite,
// but the fallbacks guarantee the client is never initialized with undefined.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://clmesnkdwohtvduzdgex.supabase.co";

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsbWVzbmtkd29odHZkdXpkZ2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDg2MDQsImV4cCI6MjA5MTE4NDYwNH0.mShxwGOOkmxneL5l4HPo_gC4hMuCnLFB_SZw_xsz7No";
