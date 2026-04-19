import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RC_BASE = "https://www.regattacentral.com";
const RC_INDEX = `${RC_BASE}/regatta/index.jsp`;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

const CACHE_24H_MS = 24 * 60 * 60 * 1000;
const CACHE_7D_MS = 7 * 24 * 60 * 60 * 1000;

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Strip HTML tags
function stripTags(s: string): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Decode common HTML entities
function decodeHtml(s: string): string {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

// Parse a date string into YYYY-MM-DD
function parseDateStr(s: string): string | null {
  if (!s) return null;
  try {
    // Handle 2-digit year MM/DD/YY → MM/DD/20YY
    const short = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (short) s = `${short[1]}/${short[2]}/20${short[3]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch {
    // ignore
  }
  return null;
}

// Parse regattas from HTML — works for index.jsp and calendar pages
function parseRegattas(html: string): any[] {
  if (!html) return [];
  const regattas: any[] = [];
  const seen = new Set<string>();

  // Match <a href="...job_id=1234...">Name</a>
  const jobPattern = /href="([^"]*[?&]job_id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = jobPattern.exec(html)) !== null) {
    const jobId = m[2];
    if (!jobId || seen.has(jobId)) continue;
    seen.add(jobId);

    const name = decodeHtml(stripTags(m[3])).trim();
    if (!name || name.length < 3) continue;
    // Skip navigation links that happen to have job_id
    if (/^(register|results|more info|details|view|click)$/i.test(name)) continue;

    const ctxStart = Math.max(0, m.index - 400);
    const ctxEnd = Math.min(html.length, m.index + m[0].length + 600);
    const context = html.slice(ctxStart, ctxEnd);

    // Date: MM/DD/YYYY or Month DD, YYYY
    const dateRaw = context.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\.?\s+\d{1,2},?\s*\d{4})/)?.[1] ?? null;
    // End date if range: "May 3 - 5" or "05/03 - 05/05"
    const endDateRaw = context.match(/[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\.?\s+\d{1,2},?\s*\d{4})/)?.[1] ?? null;
    // Location: "City, ST" pattern
    const locMatch = context.match(/([A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*),\s*([A-Z]{2})\b/);
    // Host club
    const hostMatch = context.match(/(?:host(?:ed by)?|club)[:\s]+([A-Z][^\n<,]{3,60})/i);
    // Event type
    const typeMatch = context.match(/\b(head race|head of the|head-of|sprint regatta|sprint)\b/i);

    regattas.push({
      external_id: `rc_${jobId}`,
      name,
      rc_url: `${RC_BASE}/regatta/?job_id=${jobId}`,
      event_date: dateRaw ? parseDateStr(dateRaw) : null,
      end_date: endDateRaw ? parseDateStr(endDateRaw) : null,
      location: locMatch ? `${locMatch[1]}, ${locMatch[2]}` : null,
      state: locMatch ? locMatch[2] : null,
      host_club: hostMatch ? hostMatch[1].trim().replace(/<[^>]+>/g, "").trim() : null,
      event_type: typeMatch
        ? (typeMatch[1].toLowerCase().includes("head") ? "head_race" : "sprint")
        : "other",
    });
  }

  return regattas;
}

// Parse results from a regatta detail page
function parseResults(html: string, regattaId: string): any[] {
  if (!html) return [];
  const results: any[] = [];

  // Try to find the current event heading as rows are parsed
  let currentEvent = "Unknown Event";

  // Scan line by line for headings and table rows
  const lines = html.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect event headings: <h2>, <h3>, or <td class="event..."> containing event name
    const headingMatch = line.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i) ||
      line.match(/class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/t[dh]>/i);
    if (headingMatch) {
      const heading = decodeHtml(stripTags(headingMatch[1])).trim();
      if (heading && heading.length > 2 && heading.length < 100) {
        currentEvent = heading;
      }
      continue;
    }

    // Detect table rows
    const rowMatch = line.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    if (!rowMatch) continue;

    const row = rowMatch[1];
    const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (cells.length < 3) continue;

    const cellTexts = cells.map((c) => decodeHtml(stripTags(c)).trim());

    const placementNum = parseInt(cellTexts[0], 10);
    if (isNaN(placementNum) || placementNum < 1 || placementNum > 500) continue;

    const allText = cellTexts.join(" ");
    const timeMatch = allText.match(/(\d+:\d{2}[.:]\d{1,2}|\d+:\d{2}:\d{2})/);

    results.push({
      regatta_id: regattaId,
      event_name: currentEvent,
      placement: placementNum,
      finish_time: timeMatch ? timeMatch[1] : null,
      club: cellTexts[2] || null,
      crew: cellTexts
        .slice(1, 6)
        .filter((t) => t && t.length > 1 && !/^\d+[:.]\d+/.test(t))
        .map((n) => ({ name: n })),
      raw_data: { cells: cellTexts },
    });
  }

  return results.slice(0, 500);
}

// Parse clubs from HTML
function parseClubs(html: string): any[] {
  if (!html) return [];
  const clubs: any[] = [];
  const seen = new Set<string>();

  const clubPattern = /href="([^"]*\/club[^"]*)"[^>]*>([^<]{3,80})<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = clubPattern.exec(html)) !== null) {
    const url = m[1] || "";
    const name = decodeHtml(stripTags(m[2])).trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const ctxStart = Math.max(0, m.index - 100);
    const ctxEnd = Math.min(html.length, m.index + 400);
    const context = html.slice(ctxStart, ctxEnd);

    const stateMatch = context.match(/\b([A-Z]{2})\b/);
    const typeMatch = context.match(/\b(high school|collegiate|masters|club)\b/i);

    clubs.push({
      external_id: `rc_club_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name,
      rc_url: url.startsWith("http") ? url : `${RC_BASE}${url}`,
      state: stateMatch ? stateMatch[1] : null,
      club_type: typeMatch
        ? typeMatch[1].toLowerCase().includes("high") ? "high_school"
        : typeMatch[1].toLowerCase().includes("college") ? "collegiate"
        : typeMatch[1].toLowerCase().includes("master") ? "masters"
        : "club"
        : "club",
    });
  }

  return clubs;
}

// Fetch with 10s timeout — never throws, always returns { html, error }
async function safeFetch(url: string, timeoutMs = 10000): Promise<{ html: string | null; error: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return { html: null, error: `HTTP ${res.status}` };
      const html = await res.text();
      return { html: html || null, error: null };
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "Request timed out" : (e?.message ?? "Fetch failed");
    console.error(`safeFetch error [${url}]:`, msg);
    return { html: null, error: msg };
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

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { action, query, state, event_type, regatta_id, force_refresh } = body;

  // ── Auto Load (called on page load to populate cache if stale) ────────────
  if (action === "auto_load") {
    try {
      // Check when we last cached data
      const { data: latest } = await supabase
        .from("regattas")
        .select("cached_at")
        .order("cached_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isStale = !latest?.cached_at ||
        (Date.now() - new Date(latest.cached_at).getTime() > CACHE_24H_MS);

      if (!isStale && !force_refresh) {
        return jsonOk({ refreshed: false, reason: "cache_fresh" });
      }

      // Fetch from RegattaCentral index
      const { html, error: fetchError } = await safeFetch(RC_INDEX);
      if (!html) {
        console.error("auto_load: fetch failed:", fetchError);
        return jsonOk({ refreshed: false, reason: "fetch_failed", error: "Could not reach RegattaCentral" });
      }

      const parsed = parseRegattas(html);
      let count = 0;
      const now = new Date().toISOString();

      for (const r of parsed) {
        try {
          await supabase.from("regattas").upsert(
            { ...r, cached_at: now },
            { onConflict: "external_id" },
          );
          count++;
        } catch (e) {
          console.error("auto_load upsert error:", e);
        }
      }

      return jsonOk({ refreshed: count > 0, count, timestamp: now });
    } catch (e: any) {
      console.error("auto_load error:", e?.message);
      return jsonOk({ refreshed: false, reason: "error" });
    }
  }

  // ── Search Regattas (DB-only — never fetches live from RC) ────────────────
  if (action === "search_regattas" || !action) {
    try {
      let q = supabase.from("regattas").select("*").order("event_date", { ascending: false }).limit(60);
      if (query) q = q.ilike("name", `%${query}%`);
      if (state) q = q.eq("state", state);
      if (event_type) q = q.eq("event_type", event_type);

      const { data, error } = await q;
      if (error) console.error("search_regattas query error:", error);

      return jsonOk({
        regattas: data || [],
        cached: true,
        last_updated: data?.[0]?.cached_at ?? null,
      });
    } catch (e: any) {
      console.error("search_regattas error:", e?.message);
      return jsonOk({ regattas: [], cached: true, last_updated: null });
    }
  }

  // ── Fetch Results for a Regatta ───────────────────────────────────────────
  if (action === "fetch_results") {
    if (!regatta_id) {
      return new Response(JSON.stringify({ error: "regatta_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cachedResults: any[] = [];
    try {
      const { data } = await supabase
        .from("regatta_results")
        .select("*")
        .eq("regatta_id", regatta_id)
        .order("event_name")
        .order("placement");
      cachedResults = data || [];
    } catch (e) {
      console.error("fetch_results cache read error:", e);
    }

    // Return cache immediately if fresh and not forcing
    if (cachedResults.length > 0 && !force_refresh) {
      return jsonOk({
        results: cachedResults,
        cached: true,
        last_updated: cachedResults[0]?.cached_at ?? null,
      });
    }

    // Try to fetch fresh results from RC
    let fetchedNewResults = false;
    try {
      const { data: regatta } = await supabase
        .from("regattas")
        .select("rc_url")
        .eq("id", regatta_id)
        .maybeSingle();

      if (regatta?.rc_url) {
        const sep = regatta.rc_url.includes("?") ? "&" : "?";
        const resultsUrl = `${regatta.rc_url}${sep}task=results`;
        const { html, error: fetchError } = await safeFetch(resultsUrl);

        if (html) {
          const parsed = parseResults(html, regatta_id);
          if (parsed.length > 0) {
            const now = new Date().toISOString();
            await supabase.from("regatta_results").delete().eq("regatta_id", regatta_id);
            const { error: insertError } = await supabase
              .from("regatta_results")
              .insert(parsed.map((r) => ({ ...r, cached_at: now })));
            if (insertError) {
              console.error("fetch_results insert error:", insertError);
            } else {
              fetchedNewResults = true;
            }
          }
        } else {
          console.error("fetch_results fetch failed:", fetchError);
        }
      }
    } catch (e: any) {
      console.error("fetch_results live-fetch error:", e?.message);
    }

    // Re-read from DB (fresh or cached fallback)
    try {
      const { data: fresh } = await supabase
        .from("regatta_results")
        .select("*")
        .eq("regatta_id", regatta_id)
        .order("event_name")
        .order("placement");
      const results = fresh || cachedResults;
      return jsonOk({
        results,
        cached: !fetchedNewResults,
        last_updated: results[0]?.cached_at ?? null,
      });
    } catch (e: any) {
      console.error("fetch_results final read error:", e?.message);
      return jsonOk({ results: cachedResults, cached: true, last_updated: null });
    }
  }

  // ── Search Clubs (DB-only) ────────────────────────────────────────────────
  if (action === "search_clubs") {
    try {
      let q = supabase.from("clubs").select("*").order("name").limit(100);
      if (query) q = q.ilike("name", `%${query}%`);
      if (state) q = q.eq("state", state);
      if (body.club_type) q = q.eq("club_type", body.club_type);

      const { data: cached } = await q;
      const lastCached = cached?.[0]?.cached_at ?? null;

      // Fetch from RC if cache is stale or empty
      if (!cached?.length || !lastCached || (Date.now() - new Date(lastCached).getTime() > CACHE_7D_MS) || force_refresh) {
        const clubUrl = query
          ? `${RC_BASE}/clubs/?q=${encodeURIComponent(query)}`
          : `${RC_BASE}/clubs/`;
        const { html } = await safeFetch(clubUrl);
        if (html) {
          const parsed = parseClubs(html);
          const now = new Date().toISOString();
          for (const c of parsed) {
            try {
              await supabase.from("clubs").upsert(
                { ...c, cached_at: now },
                { onConflict: "external_id" },
              );
            } catch (e) {
              console.error("clubs upsert error:", e);
            }
          }
        }
        const { data: fresh } = await q;
        return jsonOk({ clubs: fresh || cached || [], cached: false });
      }

      return jsonOk({ clubs: cached, cached: true, last_updated: lastCached });
    } catch (e: any) {
      console.error("search_clubs error:", e?.message);
      return jsonOk({ clubs: [], cached: true });
    }
  }

  // ── Refresh Upcoming (scheduled cron — hits RC index.jsp) ─────────────────
  if (action === "refresh_upcoming") {
    try {
      const { html, error: fetchError } = await safeFetch(RC_INDEX);
      if (!html) {
        console.error("refresh_upcoming fetch failed:", fetchError);
        return jsonOk({ refreshed: 0, error: "Fetch failed — cached data unchanged" });
      }

      const parsed = parseRegattas(html);
      const now = new Date().toISOString();
      let count = 0;

      for (const r of parsed) {
        try {
          await supabase.from("regattas").upsert(
            { ...r, cached_at: now },
            { onConflict: "external_id" },
          );
          count++;
        } catch (e) {
          console.error("refresh_upcoming upsert error:", e);
        }
      }

      return jsonOk({ refreshed: count, timestamp: now });
    } catch (e: any) {
      console.error("refresh_upcoming error:", e?.message);
      return jsonOk({ refreshed: 0, error: "Internal error" });
    }
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
