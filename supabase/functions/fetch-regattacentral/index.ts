import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RC_BASE = "https://www.regattacentral.com";
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

// Cache TTL: 7 days in milliseconds
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isCacheStale(cachedAt: string | null): boolean {
  if (!cachedAt) return true;
  return Date.now() - new Date(cachedAt).getTime() > CACHE_TTL_MS;
}

// Extract text between two markers in HTML
function extractBetween(html: string, open: string, close: string): string | null {
  const start = html.indexOf(open);
  if (start === -1) return null;
  const end = html.indexOf(close, start + open.length);
  if (end === -1) return null;
  return html.slice(start + open.length, end).trim();
}

// Strip HTML tags from a string
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Decode common HTML entities
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

// Parse regattas from RegattaCentral HTML
function parseRegattas(html: string): any[] {
  const regattas: any[] = [];

  // Look for common patterns: <a href="/regatta/?job_id=XXXX">Name</a>
  const jobPattern = /href="[^"]*job_id=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = jobPattern.exec(html)) !== null) {
    const jobId = m[1];
    if (seen.has(jobId)) continue;
    seen.add(jobId);

    const name = decodeHtml(stripTags(m[2])).trim();
    if (!name || name.length < 3) continue;

    // Try to find date near this match (within 500 chars)
    const context = html.slice(Math.max(0, m.index - 200), m.index + 500);
    const dateMatch = context.match(/(\d{1,2}\/\d{1,2}\/\d{4}|\w+ \d{1,2}(?:[-–]\d{1,2})?,?\s*\d{4})/);
    const locationMatch = context.match(/(?:Location|location|City|city)[:\s]+([A-Z][^<\n,]{2,40})/);
    const stateMatch = context.match(/\b([A-Z]{2})\b/);
    const typeMatch = context.match(/head race|sprint|regatta/i);

    regattas.push({
      external_id: `rc_${jobId}`,
      name,
      rc_url: `${RC_BASE}/regatta/?job_id=${jobId}`,
      event_date: dateMatch ? parseDateStr(dateMatch[1]) : null,
      location: locationMatch ? locationMatch[1].trim() : null,
      state: stateMatch ? stateMatch[1] : null,
      event_type: typeMatch
        ? typeMatch[0].toLowerCase().includes("head") ? "head_race" : "sprint"
        : "other",
    });
  }

  return regattas;
}

// Parse clubs from HTML
function parseClubs(html: string): any[] {
  const clubs: any[] = [];

  // Pattern for club links
  const clubPattern = /href="([^"]*club[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = clubPattern.exec(html)) !== null) {
    const url = m[1];
    const name = decodeHtml(stripTags(m[2])).trim();
    if (seen.has(name) || !name || name.length < 3) continue;
    seen.add(name);

    const context = html.slice(Math.max(0, m.index - 100), m.index + 400);
    const stateMatch = context.match(/\b([A-Z]{2})\b/);
    const typeMatch = context.match(/high school|collegiate|club|masters/i);

    clubs.push({
      external_id: `rc_club_${name.toLowerCase().replace(/\s+/g, "_")}`,
      name,
      rc_url: url.startsWith("http") ? url : `${RC_BASE}${url}`,
      state: stateMatch ? stateMatch[1] : null,
      club_type: typeMatch
        ? typeMatch[0].toLowerCase().includes("high") ? "high_school"
        : typeMatch[0].toLowerCase().includes("college") ? "collegiate"
        : typeMatch[0].toLowerCase().includes("master") ? "masters"
        : "club"
        : "club",
    });
  }

  return clubs;
}

// Parse results from a single regatta page
function parseResults(html: string, regattaId: string): any[] {
  const results: any[] = [];

  // Look for table rows with results data
  const tablePattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = tablePattern.exec(html)) !== null) {
    const row = m[1];
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (cells.length < 3) continue;

    const cellTexts = cells.map((c) => decodeHtml(stripTags(c)).trim());

    // Heuristic: first cell is placement (number), rest is crew/time
    const placementNum = parseInt(cellTexts[0]);
    if (isNaN(placementNum) || placementNum < 1 || placementNum > 200) continue;

    const timeMatch = cellTexts.join(" ").match(/(\d+:\d{2}\.\d{1,2}|\d+:\d{2}:\d{2})/);

    results.push({
      regatta_id: regattaId,
      placement: placementNum,
      finish_time: timeMatch ? timeMatch[1] : null,
      club: cellTexts[2] || null,
      crew: cellTexts.slice(1, 5).filter(Boolean).map((n) => ({ name: n })),
      event_name: "Unknown Event",
      raw_data: { cells: cellTexts },
    });
  }

  // Also look for event headings to assign event names
  const eventPattern = /<h[23][^>]*>(Event[^<]+)<\/h[23]>/gi;
  // (simplified — real regatta pages vary too much for perfect parsing)

  return results.slice(0, 200);
}

function parseDateStr(s: string): string | null {
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch {}
  return null;
}

// Fetch a URL with timeout and error handling
async function safeFetch(url: string, timeoutMs = 10000): Promise<{ html: string | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return { html: null, error: `HTTP ${res.status}` };
    const html = await res.text();
    return { html, error: null };
  } catch (e: any) {
    return { html: null, error: e.message ?? "Fetch failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const body = await req.json().catch(() => ({}));
    const { action, query, state, event_type, regatta_id, force_refresh } = body;

    // ── Search Regattas ────────────────────────────────────────────────────────
    if (action === "search_regattas" || !action) {
      // Check cache first
      let dbQuery = supabase.from("regattas").select("*").order("event_date", { ascending: false }).limit(50);
      if (query) dbQuery = dbQuery.ilike("name", `%${query}%`);
      if (state) dbQuery = dbQuery.eq("state", state);
      if (event_type) dbQuery = dbQuery.eq("event_type", event_type);

      const { data: cached } = await dbQuery;
      const lastCached = cached?.[0]?.cached_at ?? null;
      const stale = isCacheStale(lastCached) || force_refresh;

      if (stale) {
        // Try to fetch from RegattaCentral
        const searchUrl = query
          ? `${RC_BASE}/regatta/?task=search&q=${encodeURIComponent(query)}`
          : `${RC_BASE}/calendar/`;

        const { html, error: fetchError } = await safeFetch(searchUrl);

        if (html) {
          const parsed = parseRegattas(html);
          if (parsed.length > 0) {
            // Upsert into DB
            for (const r of parsed) {
              await supabase.from("regattas").upsert(
                { ...r, cached_at: new Date().toISOString() },
                { onConflict: "external_id" }
              );
            }
          }
        }

        // Re-query after upsert
        const { data: fresh } = await dbQuery;
        return new Response(JSON.stringify({
          regattas: fresh || [],
          cached: false,
          last_updated: new Date().toISOString(),
          fetch_error: html ? null : fetchError,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        regattas: cached || [],
        cached: true,
        last_updated: lastCached,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Fetch Results for a Regatta ───────────────────────────────────────────
    if (action === "fetch_results") {
      if (!regatta_id) {
        return new Response(JSON.stringify({ error: "regatta_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check cached results
      const { data: cachedResults } = await supabase
        .from("regatta_results").select("*").eq("regatta_id", regatta_id);

      if (cachedResults && cachedResults.length > 0 && !force_refresh) {
        return new Response(JSON.stringify({ results: cachedResults, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get the regatta to find its URL
      const { data: regatta } = await supabase.from("regattas").select("rc_url,external_id").eq("id", regatta_id).maybeSingle();

      if (regatta?.rc_url) {
        const { html } = await safeFetch(`${regatta.rc_url}&task=results`);
        if (html) {
          const parsed = parseResults(html, regatta_id);
          if (parsed.length > 0) {
            // Delete old and insert new
            await supabase.from("regatta_results").delete().eq("regatta_id", regatta_id);
            await supabase.from("regatta_results").insert(parsed.map((r) => ({ ...r, cached_at: new Date().toISOString() })));
          }
        }
      }

      const { data: fresh } = await supabase.from("regatta_results").select("*").eq("regatta_id", regatta_id);
      return new Response(JSON.stringify({ results: fresh || [], cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Search Clubs ──────────────────────────────────────────────────────────
    if (action === "search_clubs") {
      let dbQuery = supabase.from("clubs").select("*").order("name").limit(100);
      if (query) dbQuery = dbQuery.ilike("name", `%${query}%`);
      if (state) dbQuery = dbQuery.eq("state", state);
      if (body.club_type) dbQuery = dbQuery.eq("club_type", body.club_type);

      const { data: cached } = await dbQuery;
      const lastCached = cached?.[0]?.cached_at ?? null;

      if (isCacheStale(lastCached) || force_refresh || !cached?.length) {
        const clubUrl = query
          ? `${RC_BASE}/clubs/?q=${encodeURIComponent(query)}`
          : `${RC_BASE}/clubs/`;

        const { html } = await safeFetch(clubUrl);
        if (html) {
          const parsed = parseClubs(html);
          for (const c of parsed) {
            await supabase.from("clubs").upsert(
              { ...c, cached_at: new Date().toISOString() },
              { onConflict: "external_id" }
            );
          }
        }

        const { data: fresh } = await dbQuery;
        return new Response(JSON.stringify({ clubs: fresh || [], cached: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ clubs: cached || [], cached: true, last_updated: lastCached }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Refresh Upcoming (cron) ───────────────────────────────────────────────
    if (action === "refresh_upcoming") {
      const today = new Date().toISOString().split("T")[0];
      const future = new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0];

      const { html } = await safeFetch(`${RC_BASE}/calendar/?start=${today}&end=${future}`);
      let count = 0;
      if (html) {
        const parsed = parseRegattas(html);
        for (const r of parsed) {
          await supabase.from("regattas").upsert(
            { ...r, cached_at: new Date().toISOString() },
            { onConflict: "external_id" }
          );
        }
        count = parsed.length;
      }

      return new Response(JSON.stringify({ refreshed: count, timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
