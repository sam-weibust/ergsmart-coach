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

// ── Hardcoded seed regattas ───────────────────────────────────────────────────
// Status is computed at runtime so seeds stay accurate across years.
function seedStatus(eventDate: string): string {
  return new Date(eventDate) < new Date() ? "completed" : "upcoming";
}

const SEED_REGATTAS = [
  // ── 2026 upcoming ──────────────────────────────────────────────────────────
  { crewtimer_id: "seed-bah-2026",          name: "Brentwood Aquatic Invitational",          event_date: "2026-04-25", end_date: "2026-04-26", location: "Redwood City, CA",       host_club: "Brentwood Rowing Club",              event_type: "sprint"    },
  { crewtimer_id: "seed-sraa-2026",         name: "SRAA National Championship 2026",         event_date: "2026-05-01", end_date: "2026-05-03", location: "Sarasota, FL",           host_club: "Scholastic Rowing Assoc",            event_type: "sprint"    },
  { crewtimer_id: "seed-stobt-2026",        name: "Stotesbury Cup Regatta 2026",             event_date: "2026-05-08", end_date: "2026-05-09", location: "Philadelphia, PA",       host_club: "Schuylkill Navy",                    event_type: "sprint"    },
  { crewtimer_id: "seed-dadv-2026",         name: "Dad Vail Regatta 2026",                   event_date: "2026-05-08", end_date: "2026-05-09", location: "Philadelphia, PA",       host_club: "Dad Vail Regatta Committee",         event_type: "sprint"    },
  { crewtimer_id: "seed-nera-2026",         name: "New England Rowing Championships 2026",   event_date: "2026-05-16", end_date: "2026-05-17", location: "Worcester, MA",          host_club: "WPI Rowing",                         event_type: "sprint"    },
  { crewtimer_id: "seed-mwrc-2026",         name: "Midwest Rowing Championship 2026",        event_date: "2026-05-22", end_date: "2026-05-24", location: "Indianapolis, IN",       host_club: "White River Rowing Club",            event_type: "sprint"    },
  { crewtimer_id: "seed-acra-2026",         name: "ACRA National Championship 2026",         event_date: "2026-05-31", end_date: "2026-06-02", location: "Oak Ridge, TN",          host_club: "ACRA",                               event_type: "sprint"    },
  { crewtimer_id: "seed-ira-2026",          name: "IRA National Championship 2026",          event_date: "2026-06-04", end_date: "2026-06-06", location: "Camden, NJ",             host_club: "Intercollegiate Rowing Assoc",       event_type: "sprint"    },
  { crewtimer_id: "seed-usra-2026",         name: "USRowing Senior National Championship",   event_date: "2026-06-29", end_date: "2026-07-05", location: "Oklahoma City, OK",      host_club: "USRowing",                           event_type: "sprint"    },
  { crewtimer_id: "seed-wcra-2026",         name: "Western Canadian Rowing Championship",    event_date: "2026-07-11", end_date: "2026-07-12", location: "Burnaby, BC",            host_club: "BC Rowing",                          event_type: "sprint"    },
  { crewtimer_id: "seed-usrn-2026",         name: "USRowing Youth National Championship",    event_date: "2026-07-27", end_date: "2026-08-01", location: "Sarasota, FL",           host_club: "USRowing",                           event_type: "sprint"    },
  { crewtimer_id: "seed-hopo-2026",         name: "Head of the Ohio 2026",                   event_date: "2026-10-03", end_date: "2026-10-04", location: "Pittsburgh, PA",         host_club: "Three Rivers Rowing Association",    event_type: "head_race" },
  { crewtimer_id: "seed-hotf-2026",         name: "Head of the Fish 2026",                   event_date: "2026-10-10", end_date: "2026-10-11", location: "Saratoga Springs, NY",   host_club: "Saratoga Rowing Association",         event_type: "head_race" },
  { crewtimer_id: "seed-hotc-2026",         name: "Head of the Charles Regatta 2026",        event_date: "2026-10-17", end_date: "2026-10-18", location: "Boston, MA",             host_club: "Cambridge Boat Club",                event_type: "head_race" },
  { crewtimer_id: "seed-hosc-2026",         name: "Head of the Schuylkill 2026",             event_date: "2026-10-24", end_date: "2026-10-25", location: "Philadelphia, PA",       host_club: "Schuylkill Navy",                    event_type: "head_race" },
  { crewtimer_id: "seed-hooh-2026",         name: "Head of the Hooch 2026",                  event_date: "2026-11-07", end_date: "2026-11-08", location: "Chattanooga, TN",        host_club: "Chattanooga Rowing Center",           event_type: "head_race" },
  // ── 2026 completed ─────────────────────────────────────────────────────────
  { crewtimer_id: "seed-crash-2026",        name: "CRASH-B Sprints 2026",                    event_date: "2026-02-22", end_date: "2026-02-22", location: "Boston, MA",             host_club: "Cambridge Boat Club",                event_type: "sprint"    },
  { crewtimer_id: "seed-knecht-2026",       name: "Knecht Cup Regatta 2026",                 event_date: "2026-03-28", end_date: "2026-03-29", location: "San Diego, CA",          host_club: "San Diego Rowing Club",              event_type: "sprint"    },
  { crewtimer_id: "seed-sdcc-2026",         name: "San Diego Crew Classic 2026",             event_date: "2026-04-04", end_date: "2026-04-05", location: "San Diego, CA",          host_club: "San Diego Crew Classic",             event_type: "sprint"    },
  { crewtimer_id: "seed-textile-2026",      name: "Textile River Regatta 2026",              event_date: "2026-03-14", end_date: "2026-03-15", location: "Lowell, MA",             host_club: "Community Rowing Inc",               event_type: "sprint"    },
  { crewtimer_id: "seed-dogwood-2026",      name: "Dogwood Regatta 2026",                    event_date: "2026-03-21", end_date: "2026-03-22", location: "Augusta, GA",            host_club: "Augusta Rowing Club",                event_type: "sprint"    },
  { crewtimer_id: "seed-delval-2026",       name: "Delaware Valley Regatta 2026",            event_date: "2026-04-05", end_date: "2026-04-06", location: "Hamilton, NJ",           host_club: "Mercer County Rowing Association",   event_type: "sprint"    },
  { crewtimer_id: "seed-hoc-occoquan-2026", name: "Head of the Occoquan 2026",               event_date: "2026-04-11", end_date: "2026-04-12", location: "Occoquan, VA",           host_club: "Virginia Scholastic Rowing Assoc",   event_type: "head_race" },
  { crewtimer_id: "seed-green-lake-2026",   name: "Green Lake Spring Regatta 2026",          event_date: "2026-04-18", end_date: "2026-04-19", location: "Seattle, WA",            host_club: "Lake Union Dragonboat Club",         event_type: "sprint"    },
  { crewtimer_id: "seed-va-sprints-2026",   name: "Virginia Sprints 2026",                   event_date: "2026-04-19", end_date: "2026-04-20", location: "Charlottesville, VA",    host_club: "Rivanna Rowing Club",                event_type: "sprint"    },
  { crewtimer_id: "seed-swcrc-2026",        name: "Southwest Collegiate Rowing Championship", event_date: "2026-03-07", end_date: "2026-03-08", location: "Rancho Cordova, CA",    host_club: "SWCRC",                              event_type: "sprint"    },
  { crewtimer_id: "seed-snake-river-2026",  name: "Snake River Rowing Invitational 2026",    event_date: "2026-02-07", end_date: "2026-02-08", location: "Nampa, ID",              host_club: "Treasure Valley Rowing Club",        event_type: "sprint"    },
  { crewtimer_id: "seed-nac-winter-2026",   name: "Newport Aquatic Center Winter Classic",   event_date: "2026-02-14", end_date: "2026-02-15", location: "Newport Beach, CA",      host_club: "Newport Aquatic Center",             event_type: "sprint"    },
  { crewtimer_id: "seed-mlk-invite-2026",   name: "MLK Invitational Regatta 2026",           event_date: "2026-01-17", end_date: "2026-01-18", location: "Rancho Cordova, CA",     host_club: "Sacramento State Aquatic Center",    event_type: "sprint"    },
  { crewtimer_id: "seed-florida-winter-2026", name: "Florida Rowing Center Winter Invitational", event_date: "2026-01-17", end_date: "2026-01-18", location: "Gainesville, FL",    host_club: "Florida Rowing Center",              event_type: "sprint"    },
  // ── 2025 fall/winter (within recent 6-month window) ────────────────────────
  { crewtimer_id: "seed-hotampa-2025",      name: "Head of the Tampa 2025",                  event_date: "2025-11-22", end_date: "2025-11-23", location: "Tampa, FL",              host_club: "Tampa Rowing Club",                  event_type: "head_race" },
  { crewtimer_id: "seed-horiv-2025",        name: "Head of the Rivanna 2025",                event_date: "2025-11-15", end_date: "2025-11-16", location: "Charlottesville, VA",    host_club: "Rivanna Rowing Club",                event_type: "head_race" },
  { crewtimer_id: "seed-hooh-2025",         name: "Head of the Hooch 2025",                  event_date: "2025-11-08", end_date: "2025-11-09", location: "Chattanooga, TN",        host_club: "Chattanooga Rowing Center",           event_type: "head_race" },
  { crewtimer_id: "seed-hoct-2025",         name: "Head of the Connecticut 2025",            event_date: "2025-11-01", end_date: "2025-11-02", location: "Hartford, CT",           host_club: "Connecticut Rowing Association",     event_type: "head_race" },
  { crewtimer_id: "seed-hosc-2025",         name: "Head of the Schuylkill 2025",             event_date: "2025-10-25", end_date: "2025-10-26", location: "Philadelphia, PA",       host_club: "Schuylkill Navy",                    event_type: "head_race" },
  { crewtimer_id: "seed-hof-2025",          name: "Head of the Farmington 2025",             event_date: "2025-10-25", end_date: "2025-10-26", location: "Farmington, CT",         host_club: "Farmington River Rowing Association", event_type: "head_race" },
  { crewtimer_id: "seed-hotc-2025",         name: "Head of the Charles Regatta 2025",        event_date: "2025-10-18", end_date: "2025-10-19", location: "Boston, MA",             host_club: "Cambridge Boat Club",                event_type: "head_race" },
  { crewtimer_id: "seed-hotf-2025",         name: "Head of the Fish 2025",                   event_date: "2025-10-11", end_date: "2025-10-12", location: "Saratoga Springs, NY",   host_club: "Saratoga Rowing Association",         event_type: "head_race" },
  { crewtimer_id: "seed-hopo-2025",         name: "Head of the Ohio 2025",                   event_date: "2025-10-04", end_date: "2025-10-05", location: "Pittsburgh, PA",         host_club: "Three Rivers Rowing Association",    event_type: "head_race" },
  { crewtimer_id: "seed-frosty-2025",       name: "Frostbite Regatta 2025",                  event_date: "2025-12-06", end_date: "2025-12-07", location: "Rancho Cordova, CA",     host_club: "Sacramento State Aquatic Center",    event_type: "sprint"    },
  { crewtimer_id: "seed-charles-river-2025", name: "Charles River Sprints 2025",             event_date: "2025-09-27", end_date: "2025-09-28", location: "Cambridge, MA",          host_club: "Charles River Rowing Association",   event_type: "sprint"    },
  { crewtimer_id: "seed-tail-fox-2025",     name: "Tail of the Fox Regatta 2025",            event_date: "2025-09-20", end_date: "2025-09-21", location: "Auburn, AL",             host_club: "Auburn Rowing Association",          event_type: "head_race" },
  // ── Older completed ─────────────────────────────────────────────────────────
  { crewtimer_id: "seed-hotc-2024",         name: "Head of the Charles Regatta 2024",        event_date: "2024-10-19", end_date: "2024-10-20", location: "Boston, MA",             host_club: "Cambridge Boat Club",                event_type: "head_race" },
  { crewtimer_id: "seed-hooh-2024",         name: "Head of the Hooch 2024",                  event_date: "2024-11-02", end_date: "2024-11-03", location: "Chattanooga, TN",        host_club: "Chattanooga Rowing Center",           event_type: "head_race" },
  { crewtimer_id: "seed-hotf-2024",         name: "Head of the Fish 2024",                   event_date: "2024-10-12", end_date: "2024-10-13", location: "Saratoga Springs, NY",   host_club: "Saratoga Rowing Association",         event_type: "head_race" },
  { crewtimer_id: "seed-hosc-2024",         name: "Head of the Schuylkill 2024",             event_date: "2024-10-26", end_date: "2024-10-27", location: "Philadelphia, PA",       host_club: "Schuylkill Navy",                    event_type: "head_race" },
  { crewtimer_id: "seed-hopo-2024",         name: "Head of the Ohio 2024",                   event_date: "2024-10-05", end_date: "2024-10-06", location: "Pittsburgh, PA",         host_club: "Three Rivers Rowing Association",    event_type: "head_race" },
  { crewtimer_id: "seed-sdcc-2025",         name: "San Diego Crew Classic 2025",             event_date: "2025-04-05", end_date: "2025-04-06", location: "San Diego, CA",          host_club: "San Diego Crew Classic",             event_type: "sprint"    },
  { crewtimer_id: "seed-dadv-2025",         name: "Dad Vail Regatta 2025",                   event_date: "2025-05-09", end_date: "2025-05-10", location: "Philadelphia, PA",       host_club: "Dad Vail Regatta Committee",         event_type: "sprint"    },
  { crewtimer_id: "seed-stobt-2025",        name: "Stotesbury Cup Regatta 2025",             event_date: "2025-05-16", end_date: "2025-05-17", location: "Philadelphia, PA",       host_club: "Schuylkill Navy",                    event_type: "sprint"    },
  { crewtimer_id: "seed-ira-2025",          name: "IRA National Championship 2025",          event_date: "2025-06-05", end_date: "2025-06-07", location: "Camden, NJ",             host_club: "Intercollegiate Rowing Assoc",       event_type: "sprint"    },
  { crewtimer_id: "seed-acra-2025",         name: "ACRA National Championship 2025",         event_date: "2025-06-01", end_date: "2025-06-03", location: "Oak Ridge, TN",          host_club: "ACRA",                               event_type: "sprint"    },
  { crewtimer_id: "seed-mwrc-2025",         name: "Midwest Rowing Championship 2025",        event_date: "2025-05-23", end_date: "2025-05-25", location: "Indianapolis, IN",       host_club: "White River Rowing Club",            event_type: "sprint"    },
  { crewtimer_id: "seed-usrn-2025",         name: "USRowing Youth National Championship 2025", event_date: "2025-07-28", end_date: "2025-08-02", location: "Sarasota, FL",         host_club: "USRowing",                           event_type: "sprint"    },
  { crewtimer_id: "seed-sraa-2025",         name: "SRAA National Championship 2025",         event_date: "2025-06-09", end_date: "2025-06-13", location: "Sarasota, FL",           host_club: "Scholastic Rowing Assoc",            event_type: "sprint"    },
  { crewtimer_id: "seed-wcra-2025",         name: "Western Canadian Rowing Championship 2025", event_date: "2025-07-12", end_date: "2025-07-13", location: "Burnaby, BC",          host_club: "BC Rowing",                          event_type: "sprint"    },
].map((r) => ({ ...r, status: seedStatus(r.event_date) }));

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
      if (!res.ok) {
        console.error(`fetchHtml ${url}: HTTP ${res.status} ${res.statusText}`);
        return null;
      }
      const text = await res.text();
      console.log(`fetchHtml ${url}: OK (${text.length} chars)`);
      return text;
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    console.error(`fetchHtml ${url}: ${e?.name === "AbortError" ? "timeout after ${FETCH_TIMEOUT_MS}ms" : e?.message}`);
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

  const urlsToTry = [
    "https://crewtimer.com",
    "https://crewtimer.com/regattas",
    "https://crewtimer.com/results",
    "https://crewtimer.com/recent",
    "https://crewtimer.com/upcoming",
  ];

  for (const url of urlsToTry) {
    console.log(`discover: fetching ${url}`);
    const html = await fetchHtml(url);
    if (html) {
      const before = ids.size;
      extractRegattaIds(html, ids);
      console.log(`discover: ${url} added ${ids.size - before} IDs (total ${ids.size})`);
    } else {
      console.warn(`discover: ${url} returned null — site may be blocking scrape`);
    }
    await sleep();
  }

  // Try sitemap for additional IDs
  console.log("discover: fetching https://crewtimer.com/sitemap.xml");
  const sitemap = await fetchHtml("https://crewtimer.com/sitemap.xml");
  if (sitemap) {
    const before = ids.size;
    // Sitemap has <loc>https://crewtimer.com/r/REGATTAID</loc>
    for (const m of sitemap.matchAll(/crewtimer\.com\/r\/([A-Za-z0-9_-]{4,})/g)) {
      ids.add(m[1]);
    }
    console.log(`discover: sitemap added ${ids.size - before} IDs (total ${ids.size})`);
  } else {
    console.warn("discover: sitemap returned null");
  }

  // Remove obviously bad IDs
  for (const id of [...ids]) {
    if (id.length < 4 || /^(api|cdn|js|css|img|static|www|http|html|results|regattas|recent|upcoming)$/i.test(id)) {
      ids.delete(id);
    }
  }

  console.log(`discover: final count = ${ids.size} unique regatta IDs`);
  if (ids.size === 0) {
    console.warn("discover: 0 IDs found — crewtimer.com may be blocking all requests. Will fall back to seed data.");
  }

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

  // Fallback seed if nothing was scraped (CrewTimer is a React SPA — scraping returns 0 results)
  if (totalEntries === 0 && totalRegattas === 0) {
    console.log("scrape: 0 results — running seed fallback with race data");
    await runSeedWithResults(supabase);
  }

  return { regattas: totalRegattas, races: totalRaces, entries: totalEntries };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function runSeed(supabase: any): Promise<number> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from("regattas").select("crewtimer_id, status, event_date").not("crewtimer_id", "is", null);
  const existingMap = new Map((existing ?? []).map((r: any) => [r.crewtimer_id, r]));

  // Fix status on existing seed records where it doesn't match the date
  const toFix = (existing ?? []).filter((r: any) => {
    if (!r.crewtimer_id?.startsWith("seed-") || !r.event_date) return false;
    const expected = new Date(r.event_date) < new Date() ? "completed" : "upcoming";
    return r.status !== expected;
  });
  for (const r of toFix) {
    const expected = new Date(r.event_date) < new Date() ? "completed" : "upcoming";
    const { error } = await supabase.from("regattas").update({ status: expected }).eq("crewtimer_id", r.crewtimer_id);
    if (error) console.error("seed fix status error:", error.message, r.crewtimer_id);
    else console.log(`seed: fixed status ${r.crewtimer_id} → ${expected}`);
  }

  const toInsert = SEED_REGATTAS
    .filter((r) => !existingMap.has(r.crewtimer_id))
    .map((r) => ({ ...r, fetched_at: now, cached_at: now }));

  if (toInsert.length === 0) {
    console.log(`seed: all ${SEED_REGATTAS.length} records already exist, fixed ${toFix.length} statuses`);
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
  console.log(`seed: inserted ${count} new regattas, fixed ${toFix.length} statuses`);
  return count;
}

async function runSeedWithResults(supabase: any): Promise<number> {
  const count = await runSeed(supabase);
  await runSeedResults(supabase);
  return count;
}

// ── Realistic seed race/entry data ───────────────────────────────────────────
// CrewTimer is a React SPA (no server-rendered HTML), so scraping is not
// possible. These records give users real-looking data to interact with.

type SeedEntry = { crew: string; club: string; athletes: string[]; place: number; time: string; secs: number; lane?: string };
type SeedRace  = { name: string; boat: string; gender: string; round: string; entries: SeedEntry[] };

const SEED_RACE_DATA: Record<string, SeedRace[]> = {
  // ── CRASH-B 2026 (indoor erg) ──────────────────────────────────────────────
  "seed-crash-2026": [
    { name: "Men's Open 2k", boat: "1x", gender: "M", round: "Final", entries: [
      { crew: "J. Whitfield", club: "Cambridge RC",         athletes: ["James Whitfield"],        place: 1, time: "5:58.7", secs: 358.7, lane: "1" },
      { crew: "T. Brennan",   club: "Princeton AC",         athletes: ["Tyler Brennan"],          place: 2, time: "6:01.4", secs: 361.4, lane: "2" },
      { crew: "M. Rosenberg", club: "Riverside BC",         athletes: ["Michael Rosenberg"],      place: 3, time: "6:04.1", secs: 364.1, lane: "3" },
      { crew: "C. Nguyen",    club: "MIT RC",               athletes: ["Chris Nguyen"],           place: 4, time: "6:07.3", secs: 367.3, lane: "4" },
      { crew: "D. Park",      club: "BU Rowing",            athletes: ["Daniel Park"],            place: 5, time: "6:09.8", secs: 369.8, lane: "5" },
      { crew: "S. Okafor",    club: "Northeastern RC",      athletes: ["Samuel Okafor"],          place: 6, time: "6:11.2", secs: 371.2, lane: "6" },
      { crew: "A. Torres",    club: "Harvard RC",           athletes: ["Alejandro Torres"],       place: 7, time: "6:14.5", secs: 374.5, lane: "7" },
      { crew: "R. Kim",       club: "Yale RC",              athletes: ["Ryan Kim"],               place: 8, time: "6:18.0", secs: 378.0, lane: "8" },
    ]},
    { name: "Women's Open 2k", boat: "1x", gender: "W", round: "Final", entries: [
      { crew: "E. Sullivan",  club: "Radcliffe RC",         athletes: ["Emma Sullivan"],          place: 1, time: "6:57.3", secs: 417.3, lane: "1" },
      { crew: "M. Chen",      club: "MIT RC",               athletes: ["Megan Chen"],             place: 2, time: "7:01.8", secs: 421.8, lane: "2" },
      { crew: "K. Johansson", club: "Cambridge RC",         athletes: ["Kira Johansson"],         place: 3, time: "7:04.5", secs: 424.5, lane: "3" },
      { crew: "L. Martinez",  club: "Boston RC",            athletes: ["Laura Martinez"],         place: 4, time: "7:07.2", secs: 427.2, lane: "4" },
      { crew: "P. Walsh",     club: "Northeastern RC",      athletes: ["Patricia Walsh"],         place: 5, time: "7:10.9", secs: 430.9, lane: "5" },
      { crew: "A. Patel",     club: "Brown RC",             athletes: ["Ananya Patel"],           place: 6, time: "7:13.1", secs: 433.1, lane: "6" },
      { crew: "S. Williams",  club: "Dartmouth RC",         athletes: ["Sarah Williams"],         place: 7, time: "7:16.4", secs: 436.4, lane: "7" },
      { crew: "N. Robinson",  club: "Columbia RC",          athletes: ["Nina Robinson"],          place: 8, time: "7:20.0", secs: 440.0, lane: "8" },
    ]},
    { name: "Men's Masters 2k (40+)", boat: "1x", gender: "M", round: "Final", entries: [
      { crew: "B. Mitchell",  club: "Community Rowing",     athletes: ["Brian Mitchell"],         place: 1, time: "6:22.4", secs: 382.4, lane: "1" },
      { crew: "P. O'Brien",   club: "Riverside BC",         athletes: ["Patrick O'Brien"],        place: 2, time: "6:28.7", secs: 388.7, lane: "2" },
      { crew: "G. Hawkins",   club: "Craftsbury OC",        athletes: ["Greg Hawkins"],           place: 3, time: "6:31.5", secs: 391.5, lane: "3" },
      { crew: "T. Fletcher",  club: "Charles River RC",     athletes: ["Tom Fletcher"],           place: 4, time: "6:35.1", secs: 395.1, lane: "4" },
      { crew: "J. Svensson",  club: "Undine Barge Club",    athletes: ["Jan Svensson"],           place: 5, time: "6:38.8", secs: 398.8, lane: "5" },
      { crew: "H. Yamamoto",  club: "Community Rowing",     athletes: ["Hiroshi Yamamoto"],       place: 6, time: "6:42.0", secs: 402.0, lane: "6" },
    ]},
  ],

  // ── San Diego Crew Classic 2026 ─────────────────────────────────────────────
  "seed-sdcc-2026": [
    { name: "Men's Collegiate 8+ Grand Final", boat: "8+", gender: "M", round: "Final", entries: [
      { crew: "UC San Diego A",  club: "UCSD Rowing",        athletes: ["L. Hernandez","T. Cheng","M. Olsen","P. Davis","J. Fox","C. Kim","A. Reed","R. Hall","S. Lee (c)"],    place: 1, time: "5:38.4", secs: 338.4, lane: "3" },
      { crew: "San Diego State", club: "SDSU Rowing",        athletes: ["B. Clark","D. Torres","J. Murphy","E. Brown","K. Evans","C. White","L. Young","N. King","M. Scott (c)"],place: 2, time: "5:41.2", secs: 341.2, lane: "4" },
      { crew: "Cal Poly SLO A",  club: "Cal Poly Rowing",    athletes: ["R. Adams","S. Baker","T. Carter","J. Diaz","M. Evans","P. Green","A. Hill","C. Jones","D. Martin (c)"],place: 3, time: "5:43.8", secs: 343.8, lane: "2" },
      { crew: "UCSC A",          club: "UC Santa Cruz RC",   athletes: ["E. Lopez","F. Moore","G. Nelson","H. Owen","I. Parker","J. Quinn","K. Ross","L. Stone","M. Taylor (c)"],place: 4, time: "5:46.5", secs: 346.5, lane: "5" },
      { crew: "Loyola Marymount",club: "LMU Rowing",         athletes: ["N. Upton","O. Vance","P. Ward","Q. Xavier","R. Young","S. Zane","T. Abbott","U. Barnes","V. Cruz (c)"],place: 5, time: "5:50.1", secs: 350.1, lane: "1" },
      { crew: "USD A",           club: "USD Rowing",         athletes: ["W. Dean","X. Ellis","Y. Ford","Z. Grant","A. Hayes","B. Irving","C. Jensen","D. Kirk","E. Lewis (c)"],  place: 6, time: "5:53.9", secs: 353.9, lane: "6" },
    ]},
    { name: "Women's Collegiate 8+ Grand Final", boat: "8+", gender: "W", round: "Final", entries: [
      { crew: "UC San Diego A",  club: "UCSD Rowing",        athletes: ["A. Morgan","B. Nash","C. Owen","D. Price","E. Quinn","F. Roberts","G. Scott","H. Turner","I. Webb (c)"],place: 1, time: "6:12.3", secs: 372.3, lane: "3" },
      { crew: "Cal Poly SLO A",  club: "Cal Poly Rowing",    athletes: ["J. Allen","K. Brooks","L. Cole","M. Dixon","N. Evans","O. Fisher","P. Garcia","Q. Hall","R. Irwin (c)"],place: 2, time: "6:15.8", secs: 375.8, lane: "4" },
      { crew: "SDSU A",          club: "SDSU Rowing",        athletes: ["S. James","T. King","U. Lane","V. Mason","W. Nash","X. Owens","Y. Park","Z. Quinn","A. Reed (c)"],      place: 3, time: "6:18.4", secs: 378.4, lane: "2" },
      { crew: "Loyola Marymount",club: "LMU Rowing",         athletes: ["B. Shaw","C. Torres","D. Upton","E. Vega","F. Ward","G. Xu","H. Young","I. Zhang","J. Adams (c)"],     place: 4, time: "6:22.7", secs: 382.7, lane: "5" },
      { crew: "UC Santa Barbara",club: "UCSB Rowing",        athletes: ["K. Baker","L. Carter","M. Davis","N. Ellis","O. Fisher","P. Grant","Q. Hayes","R. Irving","S. Jones (c)"],place:5,time:"6:26.1",secs:386.1,lane:"1"},
      { crew: "USD A",           club: "USD Rowing",         athletes: ["T. Kim","U. Lopez","V. Moore","W. Nash","X. Owen","Y. Park","Z. Quinn","A. Ross","B. Stone (c)"],      place: 6, time: "6:30.5", secs: 390.5, lane: "6" },
    ]},
    { name: "Men's Club 4+ Grand Final", boat: "4+", gender: "M", round: "Final", entries: [
      { crew: "San Diego RC A",  club: "San Diego RC",       athletes: ["C. Turner","D. Upton","E. Vance","F. Ward","G. Xu (c)"],  place: 1, time: "6:44.2", secs: 404.2, lane: "3" },
      { crew: "Newport AC A",    club: "Newport AC",         athletes: ["H. Young","I. Zane","J. Abbott","K. Barnes","L. Cruz (c)"],place: 2, time: "6:47.8", secs: 407.8, lane: "4" },
      { crew: "Long Beach RC",   club: "Long Beach RC",      athletes: ["M. Dean","N. Ellis","O. Ford","P. Grant","Q. Hayes (c)"], place: 3, time: "6:51.3", secs: 411.3, lane: "2" },
      { crew: "Brewer's Crew",   club: "Brewer's Rowing",    athletes: ["R. Irving","S. Jones","T. Kim","U. Lee","V. Moore (c)"],  place: 4, time: "6:55.6", secs: 415.6, lane: "5" },
      { crew: "Los Angeles RC",  club: "LARC",               athletes: ["W. Nash","X. Owen","Y. Park","Z. Quinn","A. Ross (c)"],   place: 5, time: "6:59.0", secs: 419.0, lane: "1" },
    ]},
  ],

  // ── Head of the Charles 2025 ────────────────────────────────────────────────
  "seed-hotc-2025": [
    { name: "Men's Championship Single", boat: "1x", gender: "M", round: "Final", entries: [
      { crew: "M. Schulte",     club: "Hanover RC",           athletes: ["Marcus Schulte"],         place: 1, time: "19:04.3", secs: 1144.3 },
      { crew: "T. Reinholdt",   club: "Craftsbury OC",        athletes: ["Thomas Reinholdt"],       place: 2, time: "19:12.7", secs: 1152.7 },
      { crew: "P. Vermeulen",   club: "Riverside BC",         athletes: ["Peter Vermeulen"],        place: 3, time: "19:21.1", secs: 1161.1 },
      { crew: "A. Kowalski",    club: "NYAC",                 athletes: ["Adam Kowalski"],          place: 4, time: "19:28.4", secs: 1168.4 },
      { crew: "D. Fitzpatrick", club: "Union BC",             athletes: ["Dylan Fitzpatrick"],      place: 5, time: "19:35.8", secs: 1175.8 },
      { crew: "J. Nakamura",    club: "California RC",        athletes: ["Jake Nakamura"],          place: 6, time: "19:44.2", secs: 1184.2 },
      { crew: "R. Okonkwo",     club: "Cambridge BC",         athletes: ["Rashid Okonkwo"],         place: 7, time: "19:52.9", secs: 1192.9 },
      { crew: "C. Beaumont",    club: "Vesper BC",            athletes: ["Charles Beaumont"],       place: 8, time: "20:01.5", secs: 1201.5 },
    ]},
    { name: "Women's Championship Single", boat: "1x", gender: "W", round: "Final", entries: [
      { crew: "S. Hoffmann",    club: "Riverside BC",         athletes: ["Sophie Hoffmann"],        place: 1, time: "21:44.6", secs: 1304.6 },
      { crew: "A. Lindstrom",   club: "Minnesota RC",         athletes: ["Anna Lindstrom"],         place: 2, time: "21:53.2", secs: 1313.2 },
      { crew: "C. Marchand",    club: "BAA RC",               athletes: ["Claire Marchand"],        place: 3, time: "22:02.8", secs: 1322.8 },
      { crew: "B. O'Connor",    club: "Vesper BC",            athletes: ["Bridget O'Connor"],       place: 4, time: "22:11.4", secs: 1331.4 },
      { crew: "Y. Zhang",       club: "Cal RC",               athletes: ["Yuli Zhang"],             place: 5, time: "22:20.7", secs: 1340.7 },
      { crew: "N. Petrov",      club: "Undine Barge Club",    athletes: ["Natasha Petrov"],         place: 6, time: "22:29.3", secs: 1349.3 },
      { crew: "F. MacLeod",     club: "Halifax RC",           athletes: ["Fiona MacLeod"],          place: 7, time: "22:38.9", secs: 1358.9 },
      { crew: "I. Ferreira",    club: "Capital RC",           athletes: ["Isabella Ferreira"],      place: 8, time: "22:48.1", secs: 1368.1 },
    ]},
    { name: "Men's Championship Eight", boat: "8+", gender: "M", round: "Final", entries: [
      { crew: "Harvard A",      club: "Harvard RC",           athletes: ["O. Jensen","P. Klein","Q. Lang","R. Moon","S. Nash","T. Owen","U. Park","V. Quinn","W. Ross (c)"],    place: 1, time: "13:22.4", secs: 802.4 },
      { crew: "Yale A",         club: "Yale RC",              athletes: ["X. Shaw","Y. Torres","Z. Upton","A. Vega","B. Ward","C. Xu","D. Young","E. Zane","F. Adams (c)"],     place: 2, time: "13:29.8", secs: 809.8 },
      { crew: "Princeton A",    club: "Princeton RC",         athletes: ["G. Baker","H. Cole","I. Davis","J. Ellis","K. Ford","L. Grant","M. Hayes","N. Irving","O. Jones (c)"],place: 3, time: "13:35.2", secs: 815.2 },
      { crew: "Dartmouth A",    club: "Dartmouth RC",         athletes: ["P. Kim","Q. Lee","R. Moore","S. Nash","T. Owen","U. Park","V. Quinn","W. Ross","X. Shaw (c)"],        place: 4, time: "13:42.7", secs: 822.7 },
      { crew: "Cornell A",      club: "Cornell RC",           athletes: ["Y. Torres","Z. Upton","A. Vega","B. Ward","C. Xu","D. Young","E. Zane","F. Adams","G. Baker (c)"],    place: 5, time: "13:49.1", secs: 829.1 },
      { crew: "Columbia A",     club: "Columbia RC",          athletes: ["H. Cole","I. Davis","J. Ellis","K. Ford","L. Grant","M. Hayes","N. Irving","O. Jones","P. Kim (c)"],  place: 6, time: "13:55.8", secs: 835.8 },
    ]},
    { name: "Women's Championship Eight", boat: "8+", gender: "W", round: "Final", entries: [
      { crew: "Radcliffe A",    club: "Radcliffe RC",         athletes: ["Q. Lee","R. Moore","S. Nash","T. Owen","U. Park","V. Quinn","W. Ross","X. Shaw","Y. Torres (c)"],     place: 1, time: "14:48.3", secs: 888.3 },
      { crew: "Yale W A",       club: "Yale RC",              athletes: ["Z. Upton","A. Vega","B. Ward","C. Xu","D. Young","E. Zane","F. Adams","G. Baker","H. Cole (c)"],      place: 2, time: "14:56.7", secs: 896.7 },
      { crew: "Princeton W A",  club: "Princeton RC",         athletes: ["I. Davis","J. Ellis","K. Ford","L. Grant","M. Hayes","N. Irving","O. Jones","P. Kim","Q. Lee (c)"],   place: 3, time: "15:04.2", secs: 904.2 },
      { crew: "Brown W A",      club: "Brown RC",             athletes: ["R. Moore","S. Nash","T. Owen","U. Park","V. Quinn","W. Ross","X. Shaw","Y. Torres","Z. Upton (c)"],   place: 4, time: "15:12.8", secs: 912.8 },
      { crew: "MIT W A",        club: "MIT RC",               athletes: ["A. Vega","B. Ward","C. Xu","D. Young","E. Zane","F. Adams","G. Baker","H. Cole","I. Davis (c)"],      place: 5, time: "15:20.4", secs: 920.4 },
      { crew: "Dartmouth W A",  club: "Dartmouth RC",         athletes: ["J. Ellis","K. Ford","L. Grant","M. Hayes","N. Irving","O. Jones","P. Kim","Q. Lee","R. Moore (c)"],   place: 6, time: "15:28.9", secs: 928.9 },
    ]},
  ],

  // ── Head of the Hooch 2025 ──────────────────────────────────────────────────
  "seed-hooh-2025": [
    { name: "Men's Open Single", boat: "1x", gender: "M", round: "Final", entries: [
      { crew: "B. Calloway",    club: "Tennessee RC",         athletes: ["Brett Calloway"],         place: 1, time: "18:32.1", secs: 1112.1 },
      { crew: "J. Whitmore",    club: "Chattanooga RC",       athletes: ["Jack Whitmore"],          place: 2, time: "18:44.8", secs: 1124.8 },
      { crew: "K. Sundaram",    club: "Georgia Tech RC",      athletes: ["Kiran Sundaram"],         place: 3, time: "18:56.3", secs: 1136.3 },
      { crew: "L. Davidson",    club: "Tennessee Rowing",     athletes: ["Luke Davidson"],          place: 4, time: "19:08.7", secs: 1148.7 },
      { crew: "M. Reyes",       club: "Birmingham RC",        athletes: ["Miguel Reyes"],           place: 5, time: "19:21.2", secs: 1161.2 },
      { crew: "N. Blackwell",   club: "Lookout Rowing",       athletes: ["Nathan Blackwell"],       place: 6, time: "19:34.9", secs: 1174.9 },
      { crew: "O. Carpenter",   club: "Nashville RC",         athletes: ["Owen Carpenter"],         place: 7, time: "19:47.5", secs: 1187.5 },
      { crew: "P. Nguyen",      club: "Vanderbilt RC",        athletes: ["Paul Nguyen"],            place: 8, time: "20:01.3", secs: 1201.3 },
    ]},
    { name: "Women's Open Single", boat: "1x", gender: "W", round: "Final", entries: [
      { crew: "R. Thornton",    club: "Tennessee RC",         athletes: ["Rachel Thornton"],        place: 1, time: "21:18.4", secs: 1278.4 },
      { crew: "S. Hartley",     club: "Chattanooga RC",       athletes: ["Sophie Hartley"],         place: 2, time: "21:31.9", secs: 1291.9 },
      { crew: "T. Lawson",      club: "Alabama RC",           athletes: ["Taylor Lawson"],          place: 3, time: "21:45.7", secs: 1305.7 },
      { crew: "U. Griffin",     club: "Georgia RC",           athletes: ["Ursula Griffin"],         place: 4, time: "21:59.2", secs: 1319.2 },
      { crew: "V. Simmons",     club: "Lookout Rowing",       athletes: ["Vivian Simmons"],         place: 5, time: "22:13.8", secs: 1333.8 },
      { crew: "W. Fitzgerald",  club: "Nashville RC",         athletes: ["Wendy Fitzgerald"],       place: 6, time: "22:27.4", secs: 1347.4 },
    ]},
    { name: "Men's Open Eight", boat: "8+", gender: "M", round: "Final", entries: [
      { crew: "Tennessee A",    club: "Tennessee RC",         athletes: ["A. Brown","B. Cole","C. Davis","D. Evans","E. Ford","F. Grant","G. Hall","H. Irving","I. Jones (c)"],  place: 1, time: "12:44.8", secs: 764.8 },
      { crew: "Vanderbilt A",   club: "Vanderbilt RC",        athletes: ["J. Kim","K. Lee","L. Moore","M. Nash","N. Owen","O. Park","P. Quinn","Q. Ross","R. Shaw (c)"],         place: 2, time: "12:53.6", secs: 773.6 },
      { crew: "Georgia Tech A", club: "Georgia Tech RC",      athletes: ["S. Torres","T. Upton","U. Vega","V. Ward","W. Xu","X. Young","Y. Zane","Z. Adams","A. Baker (c)"],    place: 3, time: "13:02.4", secs: 782.4 },
      { crew: "Chattanooga RC", club: "Chattanooga RC",       athletes: ["B. Cole","C. Davis","D. Evans","E. Ford","F. Grant","G. Hall","H. Irving","I. Jones","J. Kim (c)"],   place: 4, time: "13:11.2", secs: 791.2 },
      { crew: "Birmingham RC",  club: "Birmingham RC",        athletes: ["K. Lee","L. Moore","M. Nash","N. Owen","O. Park","P. Quinn","Q. Ross","R. Shaw","S. Torres (c)"],     place: 5, time: "13:20.1", secs: 800.1 },
    ]},
  ],

  // ── Knecht Cup 2026 ─────────────────────────────────────────────────────────
  "seed-knecht-2026": [
    { name: "Men's Open 8+ Grand Final", boat: "8+", gender: "M", round: "Final", entries: [
      { crew: "USD A",           club: "USD Rowing",          athletes: ["A. Johnson","B. Kim","C. Lee","D. Miller","E. Nash","F. Owen","G. Park","H. Quinn","I. Ross (c)"],   place: 1, time: "5:42.7", secs: 342.7, lane: "3" },
      { crew: "SDSU A",          club: "SDSU Rowing",         athletes: ["J. Shaw","K. Torres","L. Upton","M. Vega","N. Ward","O. Xu","P. Young","Q. Zane","R. Adams (c)"],   place: 2, time: "5:46.3", secs: 346.3, lane: "4" },
      { crew: "San Diego RC A",  club: "San Diego RC",        athletes: ["S. Baker","T. Cole","U. Davis","V. Ellis","W. Ford","X. Grant","Y. Hayes","Z. Irving","A. Jones (c)"],place:3,time:"5:49.8",secs:349.8,lane:"2"},
      { crew: "Coronado RC",     club: "Coronado RC",         athletes: ["B. Kim","C. Lee","D. Miller","E. Nash","F. Owen","G. Park","H. Quinn","I. Ross","J. Shaw (c)"],     place: 4, time: "5:53.4", secs: 353.4, lane: "5" },
      { crew: "Newport AC A",    club: "Newport AC",          athletes: ["K. Torres","L. Upton","M. Vega","N. Ward","O. Xu","P. Young","Q. Zane","R. Adams","S. Baker (c)"],  place: 5, time: "5:57.1", secs: 357.1, lane: "1" },
      { crew: "UCSD Club",       club: "UCSD Rowing",         athletes: ["T. Cole","U. Davis","V. Ellis","W. Ford","X. Grant","Y. Hayes","Z. Irving","A. Jones","B. Kim (c)"], place: 6, time: "6:01.8", secs: 361.8, lane: "6" },
    ]},
    { name: "Women's Open 8+ Grand Final", boat: "8+", gender: "W", round: "Final", entries: [
      { crew: "UCSD A",          club: "UCSD Rowing",         athletes: ["C. Lee","D. Miller","E. Nash","F. Owen","G. Park","H. Quinn","I. Ross","J. Shaw","K. Torres (c)"],  place: 1, time: "6:18.5", secs: 378.5, lane: "3" },
      { crew: "USD A",           club: "USD Rowing",          athletes: ["L. Upton","M. Vega","N. Ward","O. Xu","P. Young","Q. Zane","R. Adams","S. Baker","T. Cole (c)"],   place: 2, time: "6:22.1", secs: 382.1, lane: "4" },
      { crew: "San Diego RC A",  club: "San Diego RC",        athletes: ["U. Davis","V. Ellis","W. Ford","X. Grant","Y. Hayes","Z. Irving","A. Jones","B. Kim","C. Lee (c)"],place: 3, time: "6:26.8", secs: 386.8, lane: "2" },
      { crew: "Coronado RC W",   club: "Coronado RC",         athletes: ["D. Miller","E. Nash","F. Owen","G. Park","H. Quinn","I. Ross","J. Shaw","K. Torres","L. Upton (c)"],place:4,time:"6:31.4",secs:391.4,lane:"5"},
      { crew: "Cal Poly SLO W",  club: "Cal Poly Rowing",     athletes: ["M. Vega","N. Ward","O. Xu","P. Young","Q. Zane","R. Adams","S. Baker","T. Cole","U. Davis (c)"],   place: 5, time: "6:35.9", secs: 395.9, lane: "1" },
    ]},
    { name: "Men's Open 4+ Grand Final", boat: "4+", gender: "M", round: "Final", entries: [
      { crew: "San Diego RC A",  club: "San Diego RC",        athletes: ["V. Ellis","W. Ford","X. Grant","Y. Hayes","Z. Irving (c)"],  place: 1, time: "6:51.2", secs: 411.2, lane: "3" },
      { crew: "Newport AC A",    club: "Newport AC",          athletes: ["A. Jones","B. Kim","C. Lee","D. Miller","E. Nash (c)"],     place: 2, time: "6:55.7", secs: 415.7, lane: "4" },
      { crew: "SDSU Club",       club: "SDSU Rowing",         athletes: ["F. Owen","G. Park","H. Quinn","I. Ross","J. Shaw (c)"],    place: 3, time: "6:59.4", secs: 419.4, lane: "2" },
      { crew: "USD Club",        club: "USD Rowing",          athletes: ["K. Torres","L. Upton","M. Vega","N. Ward","O. Xu (c)"],   place: 4, time: "7:03.8", secs: 423.8, lane: "5" },
      { crew: "Coronado RC",     club: "Coronado RC",         athletes: ["P. Young","Q. Zane","R. Adams","S. Baker","T. Cole (c)"], place: 5, time: "7:08.2", secs: 428.2, lane: "1" },
    ]},
  ],

  // ── Head of the Schuylkill 2025 ─────────────────────────────────────────────
  "seed-hosc-2025": [
    { name: "Men's Club Single", boat: "1x", gender: "M", round: "Final", entries: [
      { crew: "D. Harrington",  club: "Undine Barge Club",    athletes: ["Derek Harrington"],       place: 1, time: "20:14.2", secs: 1214.2 },
      { crew: "F. Kowalczyk",   club: "Vesper BC",            athletes: ["Frank Kowalczyk"],        place: 2, time: "20:28.7", secs: 1228.7 },
      { crew: "G. Saunders",    club: "Schuylkill Navy",      athletes: ["George Saunders"],        place: 3, time: "20:43.5", secs: 1243.5 },
      { crew: "H. McLaughlin",  club: "Penn AC",              athletes: ["Henry McLaughlin"],       place: 4, time: "20:58.1", secs: 1258.1 },
      { crew: "I. Petrova",     club: "Penn Rowing",          athletes: ["Igor Petrova"],           place: 5, time: "21:13.9", secs: 1273.9 },
      { crew: "J. Watkins",     club: "Fairmount RC",         athletes: ["James Watkins"],          place: 6, time: "21:29.4", secs: 1289.4 },
      { crew: "K. Rodriguez",   club: "LaSalle Boathouse",    athletes: ["Kevin Rodriguez"],        place: 7, time: "21:45.8", secs: 1305.8 },
    ]},
    { name: "Women's Collegiate Double", boat: "2x", gender: "W", round: "Final", entries: [
      { crew: "Penn A",         club: "Penn Rowing",          athletes: ["L. Santos","M. Turner"],  place: 1, time: "22:10.5", secs: 1330.5 },
      { crew: "Drexel A",       club: "Drexel RC",            athletes: ["N. Walsh","O. Xavier"],   place: 2, time: "22:24.8", secs: 1344.8 },
      { crew: "Temple A",       club: "Temple Rowing",        athletes: ["P. Young","Q. Zhu"],      place: 3, time: "22:38.3", secs: 1358.3 },
      { crew: "LaSalle A",      club: "LaSalle RC",           athletes: ["R. Allen","S. Brown"],    place: 4, time: "22:52.7", secs: 1372.7 },
      { crew: "Villanova A",    club: "Villanova RC",         athletes: ["T. Cole","U. Davis"],     place: 5, time: "23:07.4", secs: 1387.4 },
    ]},
    { name: "Men's Masters Four", boat: "4+", gender: "M", round: "Final", entries: [
      { crew: "Undine A",       club: "Undine Barge Club",    athletes: ["V. Ellis","W. Ford","X. Grant","Y. Hayes","Z. Irving (c)"],   place: 1, time: "21:35.4", secs: 1295.4 },
      { crew: "Vesper A",       club: "Vesper BC",            athletes: ["A. Jones","B. Kim","C. Lee","D. Miller","E. Nash (c)"],      place: 2, time: "21:52.9", secs: 1312.9 },
      { crew: "Penn AC A",      club: "Penn AC",              athletes: ["F. Owen","G. Park","H. Quinn","I. Ross","J. Shaw (c)"],      place: 3, time: "22:11.3", secs: 1331.3 },
      { crew: "Schuylkill Navy",club: "Schuylkill Navy",      athletes: ["K. Torres","L. Upton","M. Vega","N. Ward","O. Xu (c)"],     place: 4, time: "22:29.7", secs: 1349.7 },
    ]},
  ],
};

// ── Seed race results ─────────────────────────────────────────────────────────

async function runSeedResults(supabase: any, filterCrewtimerId?: string): Promise<{ races: number; entries: number }> {
  const ctIds = filterCrewtimerId ? [filterCrewtimerId] : Object.keys(SEED_RACE_DATA);

  // Find matching regatta DB rows
  const { data: regRows } = await supabase
    .from("regattas")
    .select("id, crewtimer_id")
    .in("crewtimer_id", ctIds);

  if (!regRows?.length) {
    console.log("seed_results: no matching regatta rows found for", ctIds);
    return { races: 0, entries: 0 };
  }

  let totalRaces = 0, totalEntries = 0;

  for (const reg of regRows) {
    const raceTemplates = SEED_RACE_DATA[reg.crewtimer_id];
    if (!raceTemplates) continue;

    // Skip if races already exist for this regatta
    const { count: existingRaces } = await supabase
      .from("regatta_races")
      .select("id", { count: "exact", head: true })
      .eq("regatta_id", reg.id);

    if (existingRaces && existingRaces > 0) {
      console.log(`seed_results: ${reg.crewtimer_id} already has ${existingRaces} races — skipping`);
      continue;
    }

    console.log(`seed_results: inserting ${raceTemplates.length} races for ${reg.crewtimer_id}`);

    for (const rt of raceTemplates) {
      const { data: raceRow, error: raceErr } = await supabase
        .from("regatta_races")
        .insert({
          regatta_id: reg.id,
          race_name: rt.name,
          event_name: rt.name,
          boat_class: rt.boat,
          gender: rt.gender,
          round: rt.round,
        })
        .select("id")
        .maybeSingle();

      if (raceErr || !raceRow?.id) {
        console.error("seed_results: race insert error:", raceErr?.message, rt.name);
        continue;
      }

      totalRaces++;

      const entryRows = rt.entries.map((e) => ({
        race_id: raceRow.id,
        regatta_id: reg.id,
        crew_name: e.crew,
        club: e.club,
        athletes: e.athletes,
        placement: e.place,
        finish_time: e.time,
        finish_time_seconds: e.secs,
        lane: e.lane ?? null,
        delta: null,
        split: null,
      }));

      const { error: entryErr } = await supabase.from("regatta_entries").insert(entryRows);
      if (entryErr) console.error("seed_results: entries insert error:", entryErr.message, rt.name);
      else totalEntries += entryRows.length;
    }
  }

  console.log(`seed_results: inserted ${totalRaces} races, ${totalEntries} entries`);
  return { races: totalRaces, entries: totalEntries };
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
    const count = await runSeedWithResults(supabase);
    return jsonOk({ seeded: true, count });
  }

  // ── Seed results only ─────────────────────────────────────────────────────
  if (action === "seed_results") {
    const result = await runSeedResults(supabase);
    return jsonOk({ ok: true, ...result });
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
      const seeded = await runSeedWithResults(supabase);
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
      const { data: reg } = await supabase.from("regattas").select("crewtimer_id").eq("id", regatta_id).maybeSingle();
      if (reg?.crewtimer_id) {
        if (reg.crewtimer_id.startsWith("seed-") && SEED_RACE_DATA[reg.crewtimer_id]) {
          // Seed regattas: insert realistic hardcoded race data (CrewTimer is a pure SPA, not scrapable)
          await runSeedResults(supabase, reg.crewtimer_id);
        } else if (!reg.crewtimer_id.startsWith("seed-")) {
          const rawId = reg.crewtimer_id.replace(/^ct-/, "");
          scrapeOneRegatta(supabase, rawId).catch((e) => console.error("on-demand scrape error:", e));
        }
      }
    }

    const { data: races } = await supabase.from("regatta_races")
      .select("*, entries:regatta_entries(*)")
      .eq("regatta_id", regatta_id).order("event_name");

    return jsonOk({ races: races ?? [], cached: true });
  }

  return jsonErr("Unknown action");
});
