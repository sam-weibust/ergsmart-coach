import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "https://esm.sh/node-html-parser";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_24H_MS = 24 * 60 * 60 * 1000;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

// ── 20 hardcoded real regattas for seed / fallback ──────────────────────────
const SEED_REGATTAS = [
  { crewtimer_id: "seed-hotc-2024",   name: "Head of the Charles Regatta",         event_date: "2024-10-19", end_date: "2024-10-20", location: "Boston, MA",          host_club: "Cambridge Boat Club",         event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-sdcc-2025",   name: "San Diego Crew Classic",              event_date: "2025-04-05", end_date: "2025-04-06", location: "San Diego, CA",        host_club: "San Diego Crew Classic",      event_type: "sprint",    status: "upcoming" },
  { crewtimer_id: "seed-dadv-2025",   name: "Dad Vail Regatta",                    event_date: "2025-05-09", end_date: "2025-05-10", location: "Philadelphia, PA",     host_club: "Dad Vail Regatta Committee",  event_type: "sprint",    status: "upcoming" },
  { crewtimer_id: "seed-hooh-2024",   name: "Head of the Hooch",                   event_date: "2024-11-02", end_date: "2024-11-03", location: "Chattanooga, TN",      host_club: "Chattanooga Rowing Center",   event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-stobt-2025",  name: "Stotesbury Cup Regatta",              event_date: "2025-05-16", end_date: "2025-05-17", location: "Philadelphia, PA",     host_club: "Schuylkill Navy",             event_type: "sprint",    status: "upcoming" },
  { crewtimer_id: "seed-ira-2025",    name: "IRA National Championship",           event_date: "2025-06-05", end_date: "2025-06-07", location: "Camden, NJ",          host_club: "Intercollegiate Rowing Assoc",event_type: "sprint",    status: "upcoming" },
  { crewtimer_id: "seed-acra-2025",   name: "ACRA National Championship",          event_date: "2025-06-01", end_date: "2025-06-03", location: "Oak Ridge, TN",        host_club: "ACRA",                        event_type: "sprint",    status: "upcoming" },
  { crewtimer_id: "seed-hotf-2024",   name: "Head of the Fish",                    event_date: "2024-10-12", end_date: "2024-10-13", location: "Saratoga Springs, NY", host_club: "Saratoga Rowing Association", event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-hosc-2024",   name: "Head of the Schuylkill",              event_date: "2024-10-26", end_date: "2024-10-27", location: "Philadelphia, PA",     host_club: "Schuylkill Navy",             event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-nera-2024",   name: "New England Rowing Championships",    event_date: "2024-05-18", end_date: "2024-05-19", location: "Worcester, MA",        host_club: "WPI Rowing",                  event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-mwrc-2025",   name: "Midwest Rowing Championship",         event_date: "2025-05-23", end_date: "2025-05-25", location: "Indianapolis, IN",     host_club: "White River Rowing Club",     event_type: "sprint",    status: "upcoming" },
  { crewtimer_id: "seed-usrn-2025",   name: "USRowing Youth National Championship",event_date: "2025-07-28", end_date: "2025-08-02", location: "Sarasota, FL",         host_club: "USRowing",                    event_type: "sprint",    status: "upcoming" },
  { crewtimer_id: "seed-hopo-2024",   name: "Head of the Ohio",                    event_date: "2024-10-05", end_date: "2024-10-06", location: "Pittsburgh, PA",       host_club: "Three Rivers Rowing Association", event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-hocuy-2024",  name: "Head of the Cuyahoga",                event_date: "2024-10-06", end_date: "2024-10-06", location: "Akron, OH",            host_club: "Western Reserve Rowing",      event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-knecht-2024", name: "Knecht Cup Regatta",                  event_date: "2024-03-23", end_date: "2024-03-24", location: "San Diego, CA",        host_club: "San Diego Rowing Club",       event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-sraa-2025",   name: "SRAA National Championship",          event_date: "2025-06-09", end_date: "2025-06-13", location: "Sarasota, FL",         host_club: "Scholastic Rowing Assoc",     event_type: "sprint",    status: "upcoming" },
  { crewtimer_id: "seed-hoten-2024",  name: "Head of the Tennessee",               event_date: "2024-11-09", end_date: "2024-11-10", location: "Knoxville, TN",        host_club: "Tennessee Rowing Club",       event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-pfcl-2024",   name: "Philadelphia Fall Classic",           event_date: "2024-10-13", end_date: "2024-10-13", location: "Philadelphia, PA",     host_club: "Schuylkill Navy",             event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-hotm-2024",   name: "Head of the Mohawk",                  event_date: "2024-10-05", end_date: "2024-10-06", location: "Schenectady, NY",      host_club: "Capital Rowing Club",         event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-wcra-2025",   name: "Western Canadian Rowing Championship",event_date: "2025-07-12", end_date: "2025-07-13", location: "Burnaby, BC",          host_club: "BC Rowing",                   event_type: "sprint",    status: "upcoming" },
];

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Seed hardcoded regattas ──────────────────────────────────────────────────
async function runSeed(supabase: any): Promise<number> {
  // Fetch existing crewtimer_ids to avoid duplicates (no unique constraint assumption)
  const { data: existing } = await supabase
    .from("regattas")
    .select("crewtimer_id")
    .not("crewtimer_id", "is", null);
  const existingIds = new Set((existing ?? []).map((r: any) => r.crewtimer_id));

  const toInsert = SEED_REGATTAS
    .filter((r) => !existingIds.has(r.crewtimer_id))
    .map((r) => ({ ...r, fetched_at: new Date().toISOString(), cached_at: new Date().toISOString() }));

  if (toInsert.length === 0) {
    console.log("seed: all records already exist, nothing to insert");
    return SEED_REGATTAS.length; // treat as success
  }

  const { data, error } = await supabase.from("regattas").insert(toInsert).select("id");
  if (error) {
    console.error("seed insert error:", error.message, error.details);
    // Try one-by-one to get past any individual row failures
    let count = 0;
    for (const r of toInsert) {
      const { error: e2 } = await supabase.from("regattas").insert(r);
      if (!e2) count++;
      else console.error("seed row error:", e2.message, r.crewtimer_id);
    }
    console.log(`seed: inserted ${count}/${toInsert.length} individually`);
    return count;
  }

  const count = data?.length ?? toInsert.length;
  console.log(`seed: inserted ${count} regattas`);
  return count;
}

// ── HTML scraping ────────────────────────────────────────────────────────────
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
      if (!res.ok) { console.error(`fetchHtml ${url}: HTTP ${res.status}`); return null; }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    console.error(`fetchHtml ${url}: ${e?.message}`);
    return null;
  }
}

async function scrapeRegattas(supabase: any): Promise<number> {
  console.log("scrape: fetching crewtimer.com");
  const html = await fetchHtml("https://crewtimer.com");
  if (!html) { console.error("scrape: failed to fetch homepage"); return 0; }

  const root = parse(html);

  // Collect all href values that look like regatta links: /r/XXXXX
  const links = root.querySelectorAll("a[href]");
  const regattaIds = new Set<string>();
  for (const link of links) {
    const href = link.getAttribute("href") ?? "";
    const m = href.match(/\/r\/([A-Za-z0-9_-]+)/);
    if (m) regattaIds.add(m[1]);
  }

  console.log(`scrape: found ${regattaIds.size} regatta links`);

  let count = 0;
  for (const rid of Array.from(regattaIds).slice(0, 50)) {
    const pageHtml = await fetchHtml(`https://crewtimer.com/r/${rid}`);
    if (!pageHtml) continue;

    const rRoot = parse(pageHtml);

    // Extract title from <title> or <h1>
    const titleEl = rRoot.querySelector("h1") ?? rRoot.querySelector("title");
    const rawTitle = titleEl?.text?.trim() ?? "";
    const title = rawTitle.replace(/\s*[-|–]\s*CrewTimer.*$/i, "").trim();
    if (!title || title.length < 3) continue;

    // Extract date — look for common date patterns in text
    const bodyText = rRoot.querySelector("body")?.text ?? pageHtml;
    const dateMatch = bodyText.match(/(\d{4}-\d{2}-\d{2})|(\w+ \d{1,2},?\s*\d{4})/);
    let eventDate: string | null = null;
    if (dateMatch) {
      try {
        const parsed = new Date(dateMatch[0]);
        if (!isNaN(parsed.getTime())) eventDate = parsed.toISOString().split("T")[0];
      } catch {}
    }

    // Extract location from meta or text containing city/state patterns
    const metaDesc = rRoot.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    const locationMatch = metaDesc.match(/in ([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/);
    const location = locationMatch ? locationMatch[1].trim() : null;

    // Determine status from date
    const status = eventDate && new Date(eventDate) < new Date() ? "completed" : "upcoming";

    const record = {
      crewtimer_id: `ct-${rid}`,
      name: title,
      event_date: eventDate,
      location,
      event_type: title.toLowerCase().includes("head") ? "head_race" : "sprint",
      status,
      fetched_at: new Date().toISOString(),
      cached_at: new Date().toISOString(),
    };

    // Check if already exists
    const { data: existing2 } = await supabase
      .from("regattas").select("id").eq("crewtimer_id", record.crewtimer_id).maybeSingle();
    let scrapeErr: any = null;
    if (existing2?.id) {
      const { error: upErr } = await supabase.from("regattas").update(record).eq("id", existing2.id);
      scrapeErr = upErr;
    } else {
      const { error: insErr } = await supabase.from("regattas").insert(record);
      scrapeErr = insErr;
    }
    if (!scrapeErr) count++;
    else console.error("scrape upsert error:", scrapeErr.message, rid);
  }

  console.log(`scrape: upserted ${count} regattas`);
  return count;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  console.log("fetch-crewtimer: received request", req.method, new Date().toISOString());

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch {}

  const action = body.action ?? "auto_load";
  console.log("fetch-crewtimer: action =", action);

  // ── Seed ────────────────────────────────────────────────────────────────────
  if (action === "seed") {
    const count = await runSeed(supabase);
    return jsonOk({ seeded: true, count });
  }

  // ── Force Refresh ────────────────────────────────────────────────────────────
  if (action === "force_refresh") {
    const scraped = await scrapeRegattas(supabase);
    if (scraped === 0) {
      console.log("force_refresh: scrape returned 0, running seed fallback");
      const seeded = await runSeed(supabase);
      return jsonOk({ refreshed: true, scraped: 0, seeded });
    }
    return jsonOk({ refreshed: true, scraped });
  }

  // ── Auto Load ────────────────────────────────────────────────────────────────
  if (action === "auto_load") {
    // Check if table is completely empty — seed immediately if so
    const { count: totalCount } = await supabase
      .from("regattas")
      .select("id", { count: "exact", head: true });

    if (!totalCount || totalCount === 0) {
      console.log("auto_load: table empty, seeding immediately");
      const seeded = await runSeed(supabase);
      // Then attempt a live scrape in parallel (don't await — return seeded data fast)
      scrapeRegattas(supabase).catch((e) => console.error("bg scrape error:", e));
      return jsonOk({ refreshed: true, reason: "was_empty", seeded });
    }

    // Check cache freshness
    const { data: latest } = await supabase
      .from("regattas")
      .select("fetched_at")
      .not("fetched_at", "is", null)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isStale = !latest?.fetched_at ||
      (Date.now() - new Date(latest.fetched_at).getTime() > CACHE_24H_MS);

    if (!isStale) {
      console.log("auto_load: cache fresh, skipping scrape");
      return jsonOk({ refreshed: false, reason: "cache_fresh", count: totalCount });
    }

    // Cache is stale — scrape
    console.log("auto_load: cache stale, scraping");
    const scraped = await scrapeRegattas(supabase);
    if (scraped === 0) {
      console.log("auto_load: scrape returned 0, running seed fallback");
      const seeded = await runSeed(supabase);
      return jsonOk({ refreshed: true, scraped: 0, seeded });
    }
    return jsonOk({ refreshed: true, scraped });
  }

  // ── Search ───────────────────────────────────────────────────────────────────
  if (action === "search") {
    const q = (body.query ?? "").trim();
    if (!q) return jsonOk({ regattas: [], athletes: [], clubs: [] });

    const [regattaRes, athleteRes, clubRes] = await Promise.all([
      supabase.from("regattas").select("id, name, event_date, end_date, location, host_club, event_type, status, level")
        .or(`name.ilike.%${q}%,location.ilike.%${q}%,host_club.ilike.%${q}%`)
        .order("event_date", { ascending: false }).limit(20),
      supabase.from("regatta_entries").select(`id, crew_name, club, athletes, placement, finish_time, race:regatta_races(event_name, boat_class, round), regatta:regattas(id, name, event_date, location)`)
        .ilike("athletes::text", `%${q}%`).order("created_at", { ascending: false }).limit(30),
      supabase.from("regatta_entries").select(`id, crew_name, club, athletes, placement, finish_time, race:regatta_races(event_name, boat_class, round), regatta:regattas(id, name, event_date, location)`)
        .ilike("club", `%${q}%`).order("created_at", { ascending: false }).limit(30),
    ]);

    return jsonOk({ regattas: regattaRes.data ?? [], athletes: athleteRes.data ?? [], clubs: clubRes.data ?? [] });
  }

  // ── Upcoming ─────────────────────────────────────────────────────────────────
  if (action === "upcoming") {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase.from("regattas")
      .select("id, name, event_date, end_date, location, host_club, event_type, level, status")
      .gte("event_date", today).order("event_date", { ascending: true }).limit(60);
    return jsonOk({ regattas: data ?? [] });
  }

  // ── Search Regattas (backward-compat) ────────────────────────────────────────
  if (action === "search_regattas") {
    let q = supabase.from("regattas").select("*").order("event_date", { ascending: false }).limit(60);
    if (body.query) q = q.ilike("name", `%${body.query}%`);
    if (body.state)  q = q.eq("state", body.state);
    if (body.event_type) q = q.eq("event_type", body.event_type);
    const { data } = await q;
    return jsonOk({ regattas: data ?? [] });
  }

  // ── Fetch results for a specific regatta ─────────────────────────────────────
  if (action === "fetch_results") {
    const regatta_id = body.regatta_id;
    if (!regatta_id) return new Response(JSON.stringify({ error: "regatta_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: races } = await supabase.from("regatta_races")
      .select("*, entries:regatta_entries(*)")
      .eq("regatta_id", regatta_id).order("event_name");
    return jsonOk({ races: races ?? [], cached: true });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
