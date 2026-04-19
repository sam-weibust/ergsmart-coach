import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RC_BASE = "https://www.regattacentral.com";
const RC_UPCOMING = `${RC_BASE}/regatta/index.jsp?num_days=365`;
const RC_PAST = `${RC_BASE}/regatta/index.jsp?past=1&num_days=180`;
const RC_INDEX = RC_UPCOMING;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

const CACHE_24H_MS = 24 * 60 * 60 * 1000;
const CACHE_7D_MS = 7 * 24 * 60 * 60 * 1000;

// Hardcoded regattas — past 2025 events (with results) + upcoming 2026 events
const SAMPLE_REGATTAS = [
  // ── Past 2025 (results available) ──
  { external_id: "sample_hotc_2025", name: "Head of the Charles Regatta", event_date: "2025-10-18", end_date: "2025-10-19", location: "Boston, MA", state: "MA", event_type: "head_race", host_club: "Charles River Watershed Association", rc_url: null },
  { external_id: "sample_crash_b_2025", name: "CRASH-B Sprints", event_date: "2025-02-16", location: "Boston, MA", state: "MA", event_type: "sprint", host_club: "Charles River All-Star Has-Beens", rc_url: null },
  { external_id: "sample_sdcc_2025", name: "San Diego Crew Classic", event_date: "2025-04-05", end_date: "2025-04-06", location: "San Diego, CA", state: "CA", event_type: "sprint", host_club: "San Diego Crew Classic", rc_url: null },
  { external_id: "sample_hooch_2025", name: "Hooch Sprints", event_date: "2025-04-12", end_date: "2025-04-13", location: "Atlanta, GA", state: "GA", event_type: "sprint", host_club: "Atlanta Rowing Club", rc_url: null },
  { external_id: "sample_knecht_2025", name: "Knecht Cup Regatta", event_date: "2025-03-29", end_date: "2025-03-30", location: "Cherry Hill, NJ", state: "NJ", event_type: "sprint", host_club: "Cooper River Rowing", rc_url: null },
  { external_id: "sample_stotesbury_2025", name: "Stotesbury Cup Regatta", event_date: "2025-05-16", location: "Philadelphia, PA", state: "PA", event_type: "sprint", host_club: "Schuylkill Navy", rc_url: null },
  { external_id: "sample_dad_vail_2025", name: "Dad Vail Regatta", event_date: "2025-05-09", end_date: "2025-05-10", location: "Philadelphia, PA", state: "PA", event_type: "sprint", host_club: "Dad Vail Regatta Association", rc_url: null },
  { external_id: "sample_midwest_sch_2025", name: "Midwest Scholastic Rowing Championships", event_date: "2025-05-03", location: "Indianapolis, IN", state: "IN", event_type: "sprint", host_club: "Midwest Scholastic Rowing Association", rc_url: null },
  { external_id: "sample_textile_2025", name: "Textile River Regatta", event_date: "2025-09-14", location: "Lowell, MA", state: "MA", event_type: "sprint", host_club: "Lowell Boat Club", rc_url: null },
  { external_id: "sample_hot_fish_2025", name: "Head of the Fish", event_date: "2025-10-04", location: "Saratoga Springs, NY", state: "NY", event_type: "head_race", host_club: "Saratoga Rowing Association", rc_url: null },
  { external_id: "sample_hosch_2025", name: "Head of the Schuylkill Regatta", event_date: "2025-10-25", end_date: "2025-10-26", location: "Philadelphia, PA", state: "PA", event_type: "head_race", host_club: "Schuylkill Navy", rc_url: null },
  { external_id: "sample_princeton_chase_2025", name: "Princeton Chase", event_date: "2025-10-11", location: "Princeton, NJ", state: "NJ", event_type: "head_race", host_club: "Princeton University Rowing", rc_url: null },
  { external_id: "sample_tail_fox_2025", name: "Tail of the Fox Regatta", event_date: "2025-09-28", location: "Auburn, AL", state: "AL", event_type: "head_race", host_club: "Auburn University Rowing", rc_url: null },
  { external_id: "sample_hot_rockaway_2025", name: "Head of the Rockaway", event_date: "2025-10-19", location: "Far Rockaway, NY", state: "NY", event_type: "head_race", host_club: "Rockaway Rowing Club", rc_url: null },
  { external_id: "sample_detroit_sprints_2025", name: "Detroit Sprints", event_date: "2025-06-07", end_date: "2025-06-08", location: "Detroit, MI", state: "MI", event_type: "sprint", host_club: "Detroit Boat Club", rc_url: null },
  // ── Upcoming 2026 ──
  { external_id: "sample_crash_b_2026", name: "CRASH-B Sprints", event_date: "2026-02-22", location: "Boston, MA", state: "MA", event_type: "sprint", host_club: "Charles River All-Star Has-Beens", rc_url: null },
  { external_id: "sample_knecht_2026", name: "Knecht Cup Regatta", event_date: "2026-03-28", end_date: "2026-03-29", location: "Cherry Hill, NJ", state: "NJ", event_type: "sprint", host_club: "Cooper River Rowing", rc_url: null },
  { external_id: "sample_sdcc_2026", name: "San Diego Crew Classic", event_date: "2026-04-04", end_date: "2026-04-05", location: "San Diego, CA", state: "CA", event_type: "sprint", host_club: "San Diego Crew Classic", rc_url: null },
  { external_id: "sample_hooch_2026", name: "Hooch Sprints", event_date: "2026-04-18", end_date: "2026-04-19", location: "Atlanta, GA", state: "GA", event_type: "sprint", host_club: "Atlanta Rowing Club", rc_url: null },
  { external_id: "sample_dad_vail_2026", name: "Dad Vail Regatta", event_date: "2026-05-08", end_date: "2026-05-09", location: "Philadelphia, PA", state: "PA", event_type: "sprint", host_club: "Dad Vail Regatta Association", rc_url: null },
  { external_id: "sample_midwest_scholastic_2026", name: "Midwest Scholastic Rowing Championships", event_date: "2026-05-02", location: "Indianapolis, IN", state: "IN", event_type: "sprint", host_club: "Midwest Scholastic Rowing Association", rc_url: null },
  { external_id: "sample_stotesbury_2026", name: "Stotesbury Cup Regatta", event_date: "2026-05-15", location: "Philadelphia, PA", state: "PA", event_type: "sprint", host_club: "Schuylkill Navy", rc_url: null },
  { external_id: "sample_detroit_sprints_2026", name: "Detroit Sprints", event_date: "2026-06-06", end_date: "2026-06-07", location: "Detroit, MI", state: "MI", event_type: "sprint", host_club: "Detroit Boat Club", rc_url: null },
  { external_id: "sample_textile_2026", name: "Textile River Regatta", event_date: "2026-09-13", location: "Lowell, MA", state: "MA", event_type: "sprint", host_club: "Lowell Boat Club", rc_url: null },
  { external_id: "sample_tail_fox_2026", name: "Tail of the Fox Regatta", event_date: "2026-09-27", location: "Auburn, AL", state: "AL", event_type: "head_race", host_club: "Auburn University Rowing", rc_url: null },
  { external_id: "sample_hot_fish_2026", name: "Head of the Fish", event_date: "2026-10-03", location: "Saratoga Springs, NY", state: "NY", event_type: "head_race", host_club: "Saratoga Rowing Association", rc_url: null },
  { external_id: "sample_princeton_chase_2026", name: "Princeton Chase", event_date: "2026-10-10", location: "Princeton, NJ", state: "NJ", event_type: "head_race", host_club: "Princeton University Rowing", rc_url: null },
  { external_id: "sample_hotc_2026", name: "Head of the Charles Regatta", event_date: "2026-10-17", end_date: "2026-10-18", location: "Boston, MA", state: "MA", event_type: "head_race", host_club: "Charles River Watershed Association", rc_url: null },
  { external_id: "sample_hot_rockaway_2026", name: "Head of the Rockaway", event_date: "2026-10-18", location: "Far Rockaway, NY", state: "NY", event_type: "head_race", host_club: "Rockaway Rowing Club", rc_url: null },
  { external_id: "sample_hosch_2026", name: "Head of the Schuylkill Regatta", event_date: "2026-10-24", end_date: "2026-10-25", location: "Philadelphia, PA", state: "PA", event_type: "head_race", host_club: "Schuylkill Navy", rc_url: null },
];

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripTags(s: string): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

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

function parseDateStr(s: string): string | null {
  if (!s) return null;
  try {
    const short = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (short) s = `${short[1]}/${short[2]}/20${short[3]}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch {
    // ignore
  }
  return null;
}

function parseRegattas(html: string): any[] {
  if (!html) return [];
  const regattas: any[] = [];
  const seen = new Set<string>();

  const jobPattern = /href="([^"]*[?&]job_id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = jobPattern.exec(html)) !== null) {
    const jobId = m[2];
    if (!jobId || seen.has(jobId)) continue;
    seen.add(jobId);

    const name = decodeHtml(stripTags(m[3])).trim();
    if (!name || name.length < 3) continue;
    if (/^(register|results|more info|details|view|click)$/i.test(name)) continue;

    const ctxStart = Math.max(0, m.index - 400);
    const ctxEnd = Math.min(html.length, m.index + m[0].length + 600);
    const context = html.slice(ctxStart, ctxEnd);

    const dateRaw = context.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\.?\s+\d{1,2},?\s*\d{4})/)?.[1] ?? null;
    const endDateRaw = context.match(/[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\.?\s+\d{1,2},?\s*\d{4})/)?.[1] ?? null;
    const locMatch = context.match(/([A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*),\s*([A-Z]{2})\b/);
    const hostMatch = context.match(/(?:host(?:ed by)?|club)[:\s]+([A-Z][^\n<,]{3,60})/i);
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

function parseResults(html: string, regattaId: string): any[] {
  if (!html) return [];
  const results: any[] = [];

  let currentEvent = "Unknown Event";

  const lines = html.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const headingMatch = line.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i) ||
      line.match(/class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/t[dh]>/i);
    if (headingMatch) {
      const heading = decodeHtml(stripTags(headingMatch[1])).trim();
      if (heading && heading.length > 2 && heading.length < 100) {
        currentEvent = heading;
      }
      continue;
    }

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

// Fetch with 8s timeout — stays under Supabase edge function limit
async function safeFetch(url: string, timeoutMs = 8000): Promise<{ html: string | null; error: string | null }> {
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
  console.log("fetch-regattacentral: request received", req.method, new Date().toISOString());

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

  console.log("fetch-regattacentral: action =", body.action ?? "(none)");

  const { action, query, state, event_type, regatta_id, force_refresh } = body;

  // ── Auto Load ────────────────────────────────────────────────────────────────
  if (action === "auto_load") {
    try {
      const { data: latest } = await supabase
        .from("regattas")
        .select("cached_at")
        .order("cached_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isStale = !latest?.cached_at ||
        (Date.now() - new Date(latest.cached_at).getTime() > CACHE_24H_MS);

      if (!isStale && !force_refresh) {
        console.log("fetch-regattacentral: cache is fresh, skipping refresh");
        return jsonOk({ refreshed: false, reason: "cache_fresh" });
      }

      console.log("fetch-regattacentral: fetching from RC (upcoming + past)...");
      const now = new Date().toISOString();
      let rcCount = 0;

      // Try upcoming events
      const { html: upcomingHtml } = await safeFetch(RC_UPCOMING);
      if (upcomingHtml) {
        const parsed = parseRegattas(upcomingHtml);
        console.log(`auto_load: RC upcoming returned ${parsed.length} regattas`);
        for (const r of parsed) {
          try {
            await supabase.from("regattas").upsert({ ...r, cached_at: now }, { onConflict: "external_id" });
            rcCount++;
          } catch (e) { console.error("upsert error:", e); }
        }
      }

      // Try past events
      const { html: pastHtml } = await safeFetch(RC_PAST);
      if (pastHtml) {
        const parsed = parseRegattas(pastHtml);
        console.log(`auto_load: RC past returned ${parsed.length} regattas`);
        for (const r of parsed) {
          try {
            await supabase.from("regattas").upsert({ ...r, cached_at: now }, { onConflict: "external_id" });
            rcCount++;
          } catch (e) { console.error("upsert error:", e); }
        }
      }

      // Always upsert seeds so past-event results stay queryable
      for (const r of SAMPLE_REGATTAS) {
        try {
          await supabase.from("regattas").upsert({ ...r, cached_at: now }, { onConflict: "external_id" });
        } catch {}
      }

      const totalCount = rcCount + SAMPLE_REGATTAS.length;
      console.log(`auto_load: done — rc=${rcCount} seeds=${SAMPLE_REGATTAS.length}`);
      return jsonOk({ refreshed: true, count: totalCount, rc_count: rcCount, timestamp: now });
    } catch (e: any) {
      console.error("auto_load error:", e?.message);
      return jsonOk({ refreshed: false, reason: "error" });
    }
  }

  // ── Search Regattas ─────────────────────────────────────────────────────────
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

  // ── Fetch Results ───────────────────────────────────────────────────────────
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

    if (cachedResults.length > 0 && !force_refresh) {
      return jsonOk({
        results: cachedResults,
        cached: true,
        last_updated: cachedResults[0]?.cached_at ?? null,
      });
    }

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

  // ── Search Clubs ─────────────────────────────────────────────────────────────
  if (action === "search_clubs") {
    try {
      let q = supabase.from("clubs").select("*").order("name").limit(100);
      if (query) q = q.ilike("name", `%${query}%`);
      if (state) q = q.eq("state", state);
      if (body.club_type) q = q.eq("club_type", body.club_type);

      const { data: cached } = await q;
      const lastCached = cached?.[0]?.cached_at ?? null;

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

  // ── Refresh Upcoming ─────────────────────────────────────────────────────────
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

  // ── Recent Results ──────────────────────────────────────────────────────────
  if (action === "recent_results") {
    try {
      const today = new Date().toISOString().split("T")[0];

      // Find the most recently completed regatta that has results
      const { data: recentWithResults } = await supabase
        .from("regattas")
        .select("id, name, event_date, location, state, event_type")
        .lte("event_date", today)
        .order("event_date", { ascending: false })
        .limit(10);

      if (!recentWithResults?.length) {
        return jsonOk({ regatta: null, results: [] });
      }

      // Find the first one with results
      for (const regatta of recentWithResults) {
        const { data: results, count } = await supabase
          .from("regatta_results")
          .select("*", { count: "exact" })
          .eq("regatta_id", regatta.id)
          .order("event_name")
          .order("placement")
          .limit(100);

        if (count && count > 0) {
          return jsonOk({ regatta, results: results || [] });
        }
      }

      // No results found — return most recent regatta with empty results
      return jsonOk({ regatta: recentWithResults[0], results: [] });
    } catch (e: any) {
      console.error("recent_results error:", e?.message);
      return jsonOk({ regatta: null, results: [] });
    }
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
