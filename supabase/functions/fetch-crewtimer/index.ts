import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parse } from "https://esm.sh/node-html-parser";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://crewtimer.com",
};

const DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 20_000;

// ── 20 hardcoded seed regattas ───────────────────────────────────────────────
const SEED_REGATTAS = [
  { crewtimer_id: "seed-hotc-2024",   name: "Head of the Charles Regatta",          event_date: "2024-10-19", end_date: "2024-10-20", location: "Boston, MA",          host_club: "Cambridge Boat Club",           event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-sdcc-2025",   name: "San Diego Crew Classic",               event_date: "2025-04-05", end_date: "2025-04-06", location: "San Diego, CA",        host_club: "San Diego Crew Classic",        event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-dadv-2025",   name: "Dad Vail Regatta",                     event_date: "2025-05-09", end_date: "2025-05-10", location: "Philadelphia, PA",     host_club: "Dad Vail Regatta Committee",    event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-hooh-2024",   name: "Head of the Hooch",                    event_date: "2024-11-02", end_date: "2024-11-03", location: "Chattanooga, TN",      host_club: "Chattanooga Rowing Center",     event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-stobt-2025",  name: "Stotesbury Cup Regatta",               event_date: "2025-05-16", end_date: "2025-05-17", location: "Philadelphia, PA",     host_club: "Schuylkill Navy",               event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-ira-2025",    name: "IRA National Championship",            event_date: "2025-06-05", end_date: "2025-06-07", location: "Camden, NJ",           host_club: "Intercollegiate Rowing Assoc",  event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-acra-2025",   name: "ACRA National Championship",           event_date: "2025-06-01", end_date: "2025-06-03", location: "Oak Ridge, TN",        host_club: "ACRA",                          event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-hotf-2024",   name: "Head of the Fish",                     event_date: "2024-10-12", end_date: "2024-10-13", location: "Saratoga Springs, NY", host_club: "Saratoga Rowing Association",   event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-hosc-2024",   name: "Head of the Schuylkill",               event_date: "2024-10-26", end_date: "2024-10-27", location: "Philadelphia, PA",     host_club: "Schuylkill Navy",               event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-nera-2024",   name: "New England Rowing Championships",     event_date: "2024-05-18", end_date: "2024-05-19", location: "Worcester, MA",        host_club: "WPI Rowing",                    event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-mwrc-2025",   name: "Midwest Rowing Championship",          event_date: "2025-05-23", end_date: "2025-05-25", location: "Indianapolis, IN",     host_club: "White River Rowing Club",       event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-usrn-2025",   name: "USRowing Youth National Championship", event_date: "2025-07-28", end_date: "2025-08-02", location: "Sarasota, FL",         host_club: "USRowing",                      event_type: "sprint",    status: "upcoming"  },
  { crewtimer_id: "seed-hopo-2024",   name: "Head of the Ohio",                     event_date: "2024-10-05", end_date: "2024-10-06", location: "Pittsburgh, PA",       host_club: "Three Rivers Rowing Association",event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-hocuy-2024",  name: "Head of the Cuyahoga",                 event_date: "2024-10-06", end_date: "2024-10-06", location: "Akron, OH",            host_club: "Western Reserve Rowing",        event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-knecht-2024", name: "Knecht Cup Regatta",                   event_date: "2024-03-23", end_date: "2024-03-24", location: "San Diego, CA",        host_club: "San Diego Rowing Club",         event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-sraa-2025",   name: "SRAA National Championship",           event_date: "2025-06-09", end_date: "2025-06-13", location: "Sarasota, FL",         host_club: "Scholastic Rowing Assoc",       event_type: "sprint",    status: "completed" },
  { crewtimer_id: "seed-hoten-2024",  name: "Head of the Tennessee",                event_date: "2024-11-09", end_date: "2024-11-10", location: "Knoxville, TN",        host_club: "Tennessee Rowing Club",         event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-pfcl-2024",   name: "Philadelphia Fall Classic",            event_date: "2024-10-13", end_date: "2024-10-13", location: "Philadelphia, PA",     host_club: "Schuylkill Navy",               event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-hotm-2024",   name: "Head of the Mohawk",                   event_date: "2024-10-05", end_date: "2024-10-06", location: "Schenectady, NY",      host_club: "Capital Rowing Club",           event_type: "head_race", status: "completed" },
  { crewtimer_id: "seed-wcra-2025",   name: "Western Canadian Rowing Championship", event_date: "2025-07-12", end_date: "2025-07-13", location: "Burnaby, BC",          host_club: "BC Rowing",                     event_type: "sprint",    status: "upcoming"  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonErr(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sleep() {
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
      if (!res.ok) { console.error(`fetchHtml ${url}: HTTP ${res.status}`); return null; }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    console.error(`fetchHtml ${url}: ${e?.name === "AbortError" ? "timeout" : e?.message}`);
    return null;
  }
}

/** Extract all /r/REGATTAID patterns from raw HTML text */
function extractRegattaIds(html: string, ids: Set<string>) {
  // From anchor hrefs
  const root = parse(html);
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    const m = href.match(/\/r\/([A-Za-z0-9_-]{4,})/);
    if (m) ids.add(m[1]);
  }
  // Also regex the raw text (catches JS bundles / inline JSON)
  for (const m of html.matchAll(/\/r\/([A-Za-z0-9_-]{4,})/g)) {
    ids.add(m[1]);
  }
}

/** Parse a time string like "7:23.4" or "1:23:45.6" into total seconds */
function parseSeconds(t: string): number | null {
  const s = (t ?? "").trim();
  if (!s || /^(DNS|DNF|SCR|DQ|---)/i.test(s)) return null;
  const parts = s.split(":");
  try {
    if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + parseFloat(parts[2]);
    if (parts.length === 2) return +parts[0] * 60 + parseFloat(parts[1]);
    return parseFloat(s);
  } catch { return null; }
}

/** Guess gender from event name */
function guessGender(name: string): string | null {
  const n = name.toLowerCase();
  if (/\bwom[ae]n\b|girls?|\bw\b|open w/i.test(n)) return "W";
  if (/\bmen\b|\bboys?\b|\bmix|\bm\b|open m/i.test(n)) return "M";
  return null;
}

/** Guess round (heat / semifinal / final) from name */
function guessRound(name: string): string | null {
  const n = name.toLowerCase();
  if (/final|grand final/.test(n)) return "Final";
  if (/semi/.test(n)) return "Semifinal";
  if (/heat|rep[ech]/.test(n)) return "Heat";
  return null;
}

/** Parse boat class from event name: 1x, 2x, 4+, 8+, etc. */
function guessBoatClass(name: string): string | null {
  const m = name.match(/\b([12348][-+x][+x]?)\b/i);
  return m ? m[1] : null;
}

// ── Scraping logic ────────────────────────────────────────────────────────────

async function discoverRegattaIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  console.log("discover: fetching https://crewtimer.com");
  const home = await fetchHtml("https://crewtimer.com");
  if (home) extractRegattaIds(home, ids);

  await sleep();

  console.log("discover: fetching https://crewtimer.com/regattas");
  const regattas = await fetchHtml("https://crewtimer.com/regattas");
  if (regattas) extractRegattaIds(regattas, ids);

  // Remove obviously bad IDs
  for (const id of ids) {
    if (id.length < 4 || /^(api|cdn|js|css|img|static)$/i.test(id)) ids.delete(id);
  }

  console.log(`discover: found ${ids.size} unique regatta IDs`);
  return ids;
}

interface RaceLink { path: string; name: string; }

async function discoverRaces(regattaId: string): Promise<RaceLink[]> {
  const url = `https://crewtimer.com/r/${regattaId}`;
  const html = await fetchHtml(url);
  if (!html) return [];

  const root = parse(html);
  const races: RaceLink[] = [];
  const seen = new Set<string>();

  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? "";
    // Race pages: /r/REGATTAID/RACE or /r/REGATTAID/results/RACE etc.
    if (!href.startsWith(`/r/${regattaId}/`)) continue;
    const suffix = href.slice(`/r/${regattaId}/`.length);
    if (!suffix || seen.has(href)) continue;
    seen.add(href);
    races.push({ path: href, name: a.text.trim() || suffix });
  }

  // Also look in raw text for race URLs
  for (const m of html.matchAll(new RegExp(`/r/${regattaId}/([A-Za-z0-9_-]+)`, "g"))) {
    const path = `/r/${regattaId}/${m[1]}`;
    if (!seen.has(path)) {
      seen.add(path);
      races.push({ path, name: m[1] });
    }
  }

  return races;
}

interface ParsedEntry {
  crew_name: string;
  club: string | null;
  athletes: string[];
  lane: string | null;
  finish_time: string | null;
  finish_time_seconds: number | null;
  placement: number | null;
  delta: string | null;
  split: string | null;
}

function parseResultsTable(html: string): ParsedEntry[] {
  const root = parse(html);
  const entries: ParsedEntry[] = [];

  // Find all tables
  for (const table of root.querySelectorAll("table")) {
    const rows = table.querySelectorAll("tr");
    if (rows.length < 2) continue;

    // Detect columns from header
    const headerCells = rows[0].querySelectorAll("th,td").map((c) => c.text.trim().toLowerCase());
    if (headerCells.length < 2) continue;

    const col = (names: string[]) => headerCells.findIndex((h) => names.some((n) => h.includes(n)));
    const placeCol  = col(["place", "rank", "#", "pos"]);
    const crewCol   = col(["crew", "entry", "name", "team"]);
    const clubCol   = col(["club", "school", "org"]);
    const laneCol   = col(["lane", "bow"]);
    const timeCol   = col(["time", "finish"]);
    const deltaCol  = col(["delta", "margin", "diff", "behind"]);
    const splitCol  = col(["split", "/500", "pace"]);
    const athleteCol = col(["athlete", "rower", "member", "cox"]);

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll("td");
      if (cells.length < 2) continue;

      const cell = (idx: number) => idx >= 0 && idx < cells.length ? cells[idx].text.trim() : "";

      const crewRaw  = crewCol  >= 0 ? cell(crewCol)  : cell(1);
      const clubRaw  = clubCol  >= 0 ? cell(clubCol)  : null;
      const timeRaw  = timeCol  >= 0 ? cell(timeCol)  : "";
      const placeRaw = placeCol >= 0 ? cell(placeCol) : cell(0);

      if (!crewRaw) continue;

      // Athletes may be in a dedicated column or embedded in crew cell
      let athletes: string[] = [];
      if (athleteCol >= 0) {
        athletes = cell(athleteCol).split(/[,;\/\n]/).map((s) => s.trim()).filter(Boolean);
      } else {
        // Try to split crew name by comma or newline
        const parts = crewRaw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length > 1) athletes = parts;
      }

      const placement = parseInt(placeRaw) || null;
      const finishTime = timeRaw || null;

      entries.push({
        crew_name: crewRaw,
        club: clubRaw || null,
        athletes,
        lane: laneCol >= 0 ? cell(laneCol) || null : null,
        finish_time: finishTime,
        finish_time_seconds: finishTime ? parseSeconds(finishTime) : null,
        placement,
        delta: deltaCol >= 0 ? cell(deltaCol) || null : null,
        split: splitCol >= 0 ? cell(splitCol) || null : null,
      });
    }

    // If we found entries from this table, use it and stop
    if (entries.length > 0) break;
  }

  // Fallback: look for list-style result items (divs/li with time patterns)
  if (entries.length === 0) {
    const timePattern = /\d+:\d{2}[\.,]\d/;
    const items = root.querySelectorAll("li, .result, .entry, [class*='result'], [class*='entry']");
    for (const item of items) {
      const text = item.text.trim();
      if (!text || !timePattern.test(text)) continue;
      const timeMatch = text.match(/(\d+:\d{2}[\.,]\d+)/);
      entries.push({
        crew_name: text.replace(timeMatch?.[0] ?? "", "").trim().slice(0, 200),
        club: null,
        athletes: [],
        lane: null,
        finish_time: timeMatch?.[0] ?? null,
        finish_time_seconds: timeMatch ? parseSeconds(timeMatch[0]) : null,
        placement: null,
        delta: null,
        split: null,
      });
    }
  }

  return entries;
}

/** Follow pagination and collect all entries for a race URL */
async function fetchAllRaceEntries(baseUrl: string): Promise<ParsedEntry[]> {
  const allEntries: ParsedEntry[] = [];
  let url: string | null = baseUrl;
  const visitedUrls = new Set<string>();

  while (url && !visitedUrls.has(url)) {
    visitedUrls.add(url);
    const html = await fetchHtml(url);
    if (!html) break;

    const entries = parseResultsTable(html);
    allEntries.push(...entries);

    // Look for next-page link
    const root = parse(html);
    let nextUrl: string | null = null;
    for (const a of root.querySelectorAll("a[href]")) {
      const text = a.text.trim().toLowerCase();
      const href = a.getAttribute("href") ?? "";
      if ((text === "next" || text === "»" || text.includes("next page")) && href) {
        nextUrl = href.startsWith("http") ? href : `https://crewtimer.com${href}`;
        break;
      }
    }

    if (!nextUrl || nextUrl === url) break;
    url = nextUrl;
    await sleep();
  }

  return allEntries;
}

// ── Regatta metadata extraction ───────────────────────────────────────────────

function extractRegattaMeta(html: string, regattaId: string) {
  const root = parse(html);

  const titleEl = root.querySelector("h1") ?? root.querySelector("title");
  let name = (titleEl?.text ?? "").trim().replace(/\s*[-|–]\s*CrewTimer.*$/i, "").trim();
  if (!name) name = `Regatta ${regattaId}`;

  const bodyText = root.text ?? "";

  // Date extraction
  let eventDate: string | null = null;
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\w+ \d{1,2},?\s*\d{4})/,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
  ];
  for (const pat of datePatterns) {
    const m = bodyText.match(pat);
    if (m) {
      try {
        const d = new Date(m[1]);
        if (!isNaN(d.getTime())) { eventDate = d.toISOString().split("T")[0]; break; }
      } catch {}
    }
  }

  // Location
  const metaDesc = root.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
  const locationM = metaDesc.match(/in ([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/);
  const location = locationM?.[1]?.trim() ?? null;

  const isHead = /head of|head race/i.test(name);
  const status = eventDate && new Date(eventDate) < new Date() ? "completed" : "upcoming";

  return {
    crewtimer_id: `ct-${regattaId}`,
    name,
    event_date: eventDate,
    location,
    event_type: isHead ? "head_race" : "sprint",
    status,
    fetched_at: new Date().toISOString(),
    cached_at: new Date().toISOString(),
  };
}

// ── Full scrape of one regatta ────────────────────────────────────────────────

async function scrapeOneRegatta(supabase: any, regattaId: string): Promise<{ races: number; entries: number }> {
  // 1. Fetch regatta index page
  const indexHtml = await fetchHtml(`https://crewtimer.com/r/${regattaId}`);
  if (!indexHtml) return { races: 0, entries: 0 };

  const meta = extractRegattaMeta(indexHtml, regattaId);

  // 2. Upsert regatta
  const { data: regattaRow, error: regErr } = await supabase
    .from("regattas")
    .upsert(meta, { onConflict: "crewtimer_id" })
    .select("id")
    .maybeSingle();

  if (regErr || !regattaRow?.id) {
    console.error(`scrapeOneRegatta ${regattaId}: regatta upsert failed`, regErr?.message);
    return { races: 0, entries: 0 };
  }

  const regattaDbId: string = regattaRow.id;

  // 3. Discover race links (delay already consumed by fetchHtml above, add one here)
  await sleep();
  const raceLinks = await discoverRaces(regattaId);

  if (raceLinks.length === 0) {
    // Treat the index page itself as the only race
    raceLinks.push({ path: `/r/${regattaId}`, name: meta.name });
  }

  // 4. Delete existing races for this regatta (entries cascade)
  await supabase.from("regatta_races").delete().eq("regatta_id", regattaDbId);

  let totalEntries = 0;

  for (const raceLink of raceLinks) {
    await sleep();
    const raceUrl = raceLink.path.startsWith("http")
      ? raceLink.path
      : `https://crewtimer.com${raceLink.path}`;

    // Insert race record
    const raceName = raceLink.name;
    const { data: raceRow, error: raceErr } = await supabase
      .from("regatta_races")
      .insert({
        regatta_id: regattaDbId,
        race_name: raceName,
        event_name: raceName,
        gender: guessGender(raceName),
        round: guessRound(raceName),
        boat_class: guessBoatClass(raceName),
      })
      .select("id")
      .maybeSingle();

    if (raceErr || !raceRow?.id) {
      console.error(`scrapeOneRegatta ${regattaId}: race insert failed`, raceErr?.message);
      continue;
    }

    const raceDbId: string = raceRow.id;

    // Fetch all entries (with pagination)
    const entries = await fetchAllRaceEntries(raceUrl);
    if (entries.length === 0) continue;

    // Batch-insert entries (chunks of 100)
    const rows = entries.map((e) => ({
      race_id: raceDbId,
      regatta_id: regattaDbId,
      crew_name: e.crew_name,
      club: e.club,
      athletes: e.athletes,
      lane: e.lane,
      finish_time: e.finish_time,
      finish_time_seconds: e.finish_time_seconds,
      placement: e.placement,
      delta: e.delta,
      split: e.split,
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const { error: entryErr } = await supabase.from("regatta_entries").insert(rows.slice(i, i + 100));
      if (entryErr) console.error(`entries insert error (${regattaId}/${raceName}):`, entryErr.message);
    }

    totalEntries += entries.length;
  }

  return { races: raceLinks.length, entries: totalEntries };
}

// ── Full scrape orchestrator ──────────────────────────────────────────────────

async function runFullScrape(supabase: any, partialDays?: number): Promise<{ regattas: number; races: number; entries: number }> {
  const regattaIds = await discoverRegattaIds();

  let ids = Array.from(regattaIds);

  // For partial scrape: only process regattas updated/created in last N days
  if (partialDays) {
    const cutoff = new Date(Date.now() - partialDays * 86_400_000).toISOString();
    const { data: recent } = await supabase
      .from("regattas")
      .select("crewtimer_id")
      .gte("fetched_at", cutoff)
      .not("crewtimer_id", "like", "seed-%");
    const recentIds = new Set((recent ?? []).map((r: any) => r.crewtimer_id?.replace(/^ct-/, "")));
    // Also include any discovered IDs not yet in DB
    const { data: allExisting } = await supabase.from("regattas").select("crewtimer_id").not("crewtimer_id", "is", null);
    const existingCtIds = new Set((allExisting ?? []).map((r: any) => r.crewtimer_id?.replace(/^ct-/, "")));
    ids = ids.filter((id) => !existingCtIds.has(id) || recentIds.has(id));
    console.log(`partial_scrape: processing ${ids.length} regattas (new or updated in last ${partialDays} days)`);
  } else {
    console.log(`full_scrape: processing ${ids.length} regattas`);
  }

  let totalRegattas = 0, totalRaces = 0, totalEntries = 0;

  for (let i = 0; i < ids.length; i++) {
    const rid = ids[i];

    if (i > 0 && i % 10 === 0) {
      console.log(`scrape progress: ${i}/${ids.length} regattas — ${totalRaces} races, ${totalEntries} entries so far`);
    }

    await sleep();
    try {
      const { races, entries } = await scrapeOneRegatta(supabase, rid);
      if (races > 0) totalRegattas++;
      totalRaces += races;
      totalEntries += entries;
    } catch (e: any) {
      console.error(`scrapeOneRegatta ${rid} threw:`, e?.message);
    }
  }

  console.log(`scrape complete: ${totalRegattas} regattas, ${totalRaces} races, ${totalEntries} entries`);

  // Enable full-text search indexes (idempotent)
  try {
    await supabase.rpc("exec_sql", {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_regatta_entries_athletes ON public.regatta_entries USING gin(athletes);
        CREATE INDEX IF NOT EXISTS idx_regatta_entries_crew_fts ON public.regatta_entries USING gin(to_tsvector('english', crew_name));
        CREATE INDEX IF NOT EXISTS idx_regatta_entries_club_fts ON public.regatta_entries USING gin(to_tsvector('english', coalesce(club,'')));
      `,
    });
  } catch {
    // exec_sql may not exist — that's fine, indexes exist from migration
  }

  // Fallback seed if nothing was scraped
  if (totalEntries === 0 && totalRegattas === 0) {
    console.log("scrape: 0 results — running seed fallback");
    await runSeed(supabase);
  }

  return { regattas: totalRegattas, races: totalRaces, entries: totalEntries };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function runSeed(supabase: any): Promise<number> {
  const { data: existing } = await supabase.from("regattas").select("crewtimer_id").not("crewtimer_id", "is", null);
  const existingIds = new Set((existing ?? []).map((r: any) => r.crewtimer_id));

  const toInsert = SEED_REGATTAS
    .filter((r) => !existingIds.has(r.crewtimer_id))
    .map((r) => ({ ...r, fetched_at: new Date().toISOString(), cached_at: new Date().toISOString() }));

  if (toInsert.length === 0) {
    console.log("seed: all records already exist");
    return SEED_REGATTAS.length;
  }

  const { data, error } = await supabase.from("regattas").insert(toInsert).select("id");
  if (error) {
    let count = 0;
    for (const r of toInsert) {
      const { error: e2 } = await supabase.from("regattas").insert(r);
      if (!e2) count++; else console.error("seed row error:", e2.message, r.crewtimer_id);
    }
    console.log(`seed: inserted ${count}/${toInsert.length} individually`);
    return count;
  }

  const count = data?.length ?? toInsert.length;
  console.log(`seed: inserted ${count} regattas`);
  return count;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch {}

  const action = body.action ?? "auto_load";
  console.log("fetch-crewtimer:", action, new Date().toISOString());

  // ── Seed ──────────────────────────────────────────────────────────────────
  if (action === "seed") {
    const count = await runSeed(supabase);
    return jsonOk({ seeded: true, count });
  }

  // ── Full scrape ────────────────────────────────────────────────────────────
  if (action === "full_scrape" || action === "force_refresh") {
    const result = await runFullScrape(supabase);
    return jsonOk({ ok: true, ...result });
  }

  // ── Partial scrape (last 7 days) ───────────────────────────────────────────
  if (action === "partial_scrape" || action === "sync") {
    const days = body.days ?? 7;
    const result = await runFullScrape(supabase, days);
    return jsonOk({ ok: true, partial: true, days, ...result });
  }

  // ── Auto load ─────────────────────────────────────────────────────────────
  if (action === "auto_load") {
    const { count: total } = await supabase.from("regattas").select("id", { count: "exact", head: true });
    if (!total || total === 0) {
      const seeded = await runSeed(supabase);
      runFullScrape(supabase).catch((e) => console.error("bg full_scrape error:", e));
      return jsonOk({ refreshed: true, reason: "was_empty", seeded });
    }

    const { data: latest } = await supabase.from("regattas")
      .select("fetched_at").not("fetched_at", "is", null)
      .order("fetched_at", { ascending: false }).limit(1).maybeSingle();

    const staleMs = 24 * 60 * 60 * 1000;
    const isStale = !latest?.fetched_at || Date.now() - new Date(latest.fetched_at).getTime() > staleMs;

    if (!isStale) return jsonOk({ refreshed: false, reason: "cache_fresh", count: total });

    runFullScrape(supabase, 7).catch((e) => console.error("bg partial_scrape error:", e));
    return jsonOk({ refreshed: true, reason: "triggered_background_scrape" });
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  if (action === "search") {
    const q = (body.query ?? "").trim();
    if (!q) return jsonOk({ regattas: [], athletes: [], clubs: [] });

    const [regRes, athRes, clubRes] = await Promise.all([
      supabase.from("regattas")
        .select("id, name, event_date, end_date, location, host_club, event_type, status, level")
        .or(`name.ilike.%${q}%,location.ilike.%${q}%,host_club.ilike.%${q}%`)
        .order("event_date", { ascending: false }).limit(20),
      supabase.from("regatta_entries")
        .select("id, crew_name, club, athletes, placement, finish_time, race:regatta_races(event_name, boat_class, round), regatta:regattas(id, name, event_date, location)")
        .ilike("athletes::text", `%${q}%`)
        .order("created_at", { ascending: false }).limit(30),
      supabase.from("regatta_entries")
        .select("id, crew_name, club, athletes, placement, finish_time, race:regatta_races(event_name, boat_class, round), regatta:regattas(id, name, event_date, location)")
        .ilike("club", `%${q}%`)
        .order("created_at", { ascending: false }).limit(30),
    ]);

    return jsonOk({ regattas: regRes.data ?? [], athletes: athRes.data ?? [], clubs: clubRes.data ?? [] });
  }

  // ── Upcoming ───────────────────────────────────────────────────────────────
  if (action === "upcoming") {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase.from("regattas")
      .select("id, name, event_date, end_date, location, host_club, event_type, level, status")
      .gte("event_date", today).order("event_date", { ascending: true }).limit(60);
    return jsonOk({ regattas: data ?? [] });
  }

  // ── Search regattas (backward-compat) ──────────────────────────────────────
  if (action === "search_regattas") {
    let q = supabase.from("regattas").select("*").order("event_date", { ascending: false }).limit(60);
    if (body.query) q = q.ilike("name", `%${body.query}%`);
    if (body.state) q = q.eq("state", body.state);
    if (body.event_type) q = q.eq("event_type", body.event_type);
    const { data } = await q;
    return jsonOk({ regattas: data ?? [] });
  }

  // ── Fetch results for a specific regatta ───────────────────────────────────
  if (action === "fetch_results") {
    const regatta_id = body.regatta_id;
    if (!regatta_id) return jsonErr("regatta_id required");

    // Check if this regatta has entries; if not, trigger a scrape
    const { count: entryCount } = await supabase.from("regatta_entries")
      .select("id", { count: "exact", head: true }).eq("regatta_id", regatta_id);

    if (!entryCount || entryCount === 0) {
      // Find crewtimer_id and scrape
      const { data: reg } = await supabase.from("regattas").select("crewtimer_id").eq("id", regatta_id).maybeSingle();
      if (reg?.crewtimer_id && !reg.crewtimer_id.startsWith("seed-")) {
        const rawId = reg.crewtimer_id.replace(/^ct-/, "");
        scrapeOneRegatta(supabase, rawId).catch((e) => console.error("on-demand scrape error:", e));
      }
    }

    const { data: races } = await supabase.from("regatta_races")
      .select("*, entries:regatta_entries(*)")
      .eq("regatta_id", regatta_id).order("event_name");

    return jsonOk({ races: races ?? [], cached: true });
  }

  return jsonErr("Unknown action");
});
