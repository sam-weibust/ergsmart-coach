import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CT_BASE = "https://api.crewtimer.com/v1";
const CACHE_24H_MS = 24 * 60 * 60 * 1000;

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ctHeaders(): Record<string, string> {
  const apiKey = Deno.env.get("CREWTIMER_API_KEY");
  const h: Record<string, string> = { "Accept": "application/json", "Content-Type": "application/json" };
  if (apiKey) h["x-api-key"] = apiKey;
  return h;
}

async function safeFetch(url: string, timeoutMs = 10000): Promise<{ data: any; error: string | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: ctHeaders(), signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { data, error: null };
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "timeout" : (e?.message ?? "fetch failed");
    console.error(`safeFetch error [${url}]:`, msg);
    return { data: null, error: msg };
  }
}

// Normalize regatta from CrewTimer response (handles multiple possible shapes)
function parseRegatta(r: any): any {
  // CrewTimer may use different field names
  const id = r.regatta_id ?? r.RegattaId ?? r.id ?? null;
  const title = r.title ?? r.Title ?? r.name ?? r.Name ?? "";
  const date = r.date ?? r.Date ?? r.start_date ?? r.StartDate ?? null;
  const endDate = r.end_date ?? r.EndDate ?? r.end ?? null;
  const location = r.location ?? r.Location ?? r.venue ?? r.Venue ?? null;
  const hostClub = r.host_club ?? r.HostClub ?? r.host ?? r.Host ?? r.organizer ?? null;
  const level = r.level ?? r.Level ?? r.division ?? null;
  const type = (r.type ?? r.Type ?? r.race_type ?? "").toLowerCase();
  const rawStatus = (r.status ?? r.Status ?? "").toLowerCase();

  let eventType = "other";
  if (type.includes("head") || type.includes("distance") || type.includes("time_trial")) eventType = "head_race";
  else if (type.includes("sprint") || type.includes("side")) eventType = "sprint";

  let status = "upcoming";
  if (rawStatus.includes("complet") || rawStatus.includes("final") || rawStatus.includes("done")) status = "completed";
  else if (rawStatus.includes("live") || rawStatus.includes("active") || rawStatus.includes("in_progress")) status = "completed";

  // Determine status from date if not explicit
  if (!rawStatus && date) {
    const eventDate = new Date(date);
    if (eventDate < new Date()) status = "completed";
  }

  return { id: String(id ?? ""), title, date, endDate, location, hostClub, level, eventType, status, raw: r };
}

// Normalize race from CrewTimer results
function parseRace(r: any, regattaId: string): { race: any; entries: any[] } {
  const raceName = r.race_name ?? r.RaceName ?? r.EventNum ?? r.event_num ?? r.Name ?? r.name ?? "";
  const eventName = r.event ?? r.Event ?? r.event_name ?? r.EventName ?? raceName;
  const boatClass = r.boat_class ?? r.BoatClass ?? r.event_class ?? null;
  const gender = r.gender ?? r.Gender ?? guessGender(eventName) ?? null;
  const round = normalizeRound(r.round ?? r.Round ?? r.heat ?? r.flight ?? "");
  const scheduledTime = r.start_time ?? r.StartTime ?? r.scheduled_time ?? r.time ?? null;

  const rawEntries = r.results ?? r.Results ?? r.entries ?? r.Entries ?? [];

  const race = { regattaId, raceName, eventName, boatClass, gender, round, scheduledTime, raw: r };

  const entries = rawEntries.map((e: any) => {
    const place = e.place ?? e.Place ?? e.placement ?? e.finish_place ?? e.Finish ?? null;
    const crewName = e.team ?? e.Team ?? e.crew ?? e.Crew ?? e.name ?? e.Name ?? null;
    const club = e.club ?? e.Club ?? e.org ?? e.Org ?? crewName ?? null;
    const lane = e.lane ?? e.Lane ?? e.bow ?? e.Bow ?? null;
    const finishTime = e.finish_time ?? e.FinishTime ?? e.time ?? e.Time ?? null;
    const finishSec = parseTimeSec(finishTime);
    const delta = e.delta ?? e.Delta ?? e.gap ?? null;
    const split = e.split ?? e.Split ?? e.pace ?? null;
    const rawAthletes = e.athletes ?? e.Athletes ?? e.crew_members ?? e.names ?? [];

    let athletes: string[] = [];
    if (Array.isArray(rawAthletes)) {
      athletes = rawAthletes.map((a: any) =>
        typeof a === "string" ? a : (a?.name ?? a?.Name ?? a?.full_name ?? JSON.stringify(a))
      ).filter(Boolean);
    }

    // Sometimes the crew name contains athlete names
    if (athletes.length === 0 && crewName) athletes = [crewName];

    return {
      regattaId,
      crewName,
      club,
      athletes,
      lane: lane != null ? String(lane) : null,
      finishTime,
      finishTimeSec: finishSec,
      placement: place != null ? Number(place) : null,
      delta,
      split,
      raw: e,
    };
  });

  return { race, entries };
}

function guessGender(eventName: string): string | null {
  const n = eventName.toLowerCase();
  if (n.includes("women") || n.includes("woman") || n.includes("girl") || n.match(/\bw\b/)) return "women";
  if (n.includes("men") || n.includes("boy") || n.match(/\bm\b/)) return "men";
  if (n.includes("mixed") || n.includes("mix")) return "mixed";
  return null;
}

function normalizeRound(round: string): string {
  const r = round.toLowerCase();
  if (r.includes("final")) return "final";
  if (r.includes("semi")) return "semifinal";
  if (r.includes("heat") || r.includes("prelim") || r.includes("flight")) return "heat";
  if (r.includes("time") || r.includes("tt")) return "time_trial";
  return round || "other";
}

function parseTimeSec(t: string | null): number | null {
  if (!t) return null;
  const parts = t.replace(/[.]/g, ":").split(":");
  if (parts.length >= 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    const ms = parts[2] ? parseFloat(parts[2]) / (parts[2].length === 1 ? 10 : 100) : 0;
    if (!isNaN(m) && !isNaN(s)) return m * 60 + s + ms;
  }
  return null;
}

// Upsert a regatta and return its DB id
async function upsertRegatta(supabase: any, r: any): Promise<string | null> {
  if (!r.id || !r.title) return null;

  const record: any = {
    crewtimer_id: r.id,
    name: r.title,
    event_date: r.date ?? null,
    end_date: r.endDate ?? null,
    location: r.location ?? null,
    host_club: r.hostClub ?? null,
    level: r.level ?? null,
    event_type: r.eventType,
    status: r.status,
    raw_data: r.raw,
    fetched_at: new Date().toISOString(),
    cached_at: new Date().toISOString(),
  };

  // Try upsert by crewtimer_id
  const { data, error } = await supabase
    .from("regattas")
    .upsert(record, { onConflict: "crewtimer_id" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("upsertRegatta error:", error.message);
    return null;
  }
  return data?.id ?? null;
}

async function upsertRacesAndEntries(supabase: any, regattaDbId: string, races: any[]): Promise<void> {
  // Delete existing races for this regatta to avoid duplicates
  await supabase.from("regatta_races").delete().eq("regatta_id", regattaDbId);

  for (const { race, entries } of races) {
    const raceRecord: any = {
      regatta_id: regattaDbId,
      race_name: race.raceName,
      event_name: race.eventName,
      level: race.level ?? null,
      boat_class: race.boatClass,
      gender: race.gender,
      round: race.round,
      scheduled_time: race.scheduledTime,
      raw_data: race.raw,
    };

    const { data: raceData, error: raceErr } = await supabase
      .from("regatta_races")
      .insert(raceRecord)
      .select("id")
      .maybeSingle();

    if (raceErr || !raceData?.id) {
      console.error("upsertRace error:", raceErr?.message);
      continue;
    }

    const raceDbId = raceData.id;
    const entryRecords = entries.map((e: any) => ({
      race_id: raceDbId,
      regatta_id: regattaDbId,
      crew_name: e.crewName,
      club: e.club,
      athletes: e.athletes,
      lane: e.lane,
      finish_time: e.finishTime,
      finish_time_seconds: e.finishTimeSec,
      placement: e.placement,
      delta: e.delta,
      split: e.split,
      raw_data: e.raw,
    }));

    if (entryRecords.length > 0) {
      const { error: entryErr } = await supabase.from("regatta_entries").insert(entryRecords);
      if (entryErr) console.error("upsertEntries error:", entryErr.message);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch {}

  const { action = "auto_load", query, regatta_id, force_refresh } = body;
  console.log("fetch-crewtimer: action =", action, new Date().toISOString());

  // ── Auto Load ────────────────────────────────────────────────────────────────
  if (action === "auto_load") {
    const { data: latest } = await supabase
      .from("regattas")
      .select("fetched_at")
      .not("crewtimer_id", "is", null)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isStale = !latest?.fetched_at ||
      (Date.now() - new Date(latest.fetched_at).getTime() > CACHE_24H_MS);

    if (!isStale && !force_refresh) return jsonOk({ refreshed: false, reason: "cache_fresh" });

    // Fall through to sync
    body.action = "sync";
  }

  // ── Full Sync ────────────────────────────────────────────────────────────────
  if (action === "sync" || body.action === "sync") {
    let count = 0;
    let error: string | null = null;

    const { data: regattaListData, error: listErr } = await safeFetch(`${CT_BASE}/regattas`);

    if (listErr || !regattaListData) {
      console.error("CrewTimer list fetch failed:", listErr);
      error = listErr ?? "fetch failed";
    } else {
      // Normalize list — may be array or wrapped in Items/regattas/data
      const rawList: any[] = Array.isArray(regattaListData)
        ? regattaListData
        : (regattaListData.Items ?? regattaListData.regattas ?? regattaListData.data ?? []);

      console.log(`sync: fetched ${rawList.length} regattas from CrewTimer`);

      const parsed = rawList.map(parseRegatta).filter((r) => r.id && r.title);

      // Upsert all regatta metadata
      for (const r of parsed) {
        await upsertRegatta(supabase, r);
        count++;
      }

      // Fetch results for the 10 most recent completed regattas
      const completed = parsed.filter((r) => r.status === "completed").slice(0, 10);
      for (const r of completed) {
        const { data: resultsData, error: resErr } = await safeFetch(`${CT_BASE}/regatta/${r.id}/results`);
        if (resErr || !resultsData) continue;

        const { data: dbRegatta } = await supabase
          .from("regattas")
          .select("id")
          .eq("crewtimer_id", r.id)
          .maybeSingle();
        if (!dbRegatta?.id) continue;

        const rawRaces: any[] = resultsData.races ?? resultsData.Races ?? resultsData.events ?? resultsData.Events ?? [];
        const parsedRaces = rawRaces.map((race: any) => parseRace(race, dbRegatta.id));
        await upsertRacesAndEntries(supabase, dbRegatta.id, parsedRaces);
      }
    }

    return jsonOk({ refreshed: true, count, error });
  }

  // ── Search ───────────────────────────────────────────────────────────────────
  if (action === "search") {
    const q = (query ?? "").trim();
    if (!q) return jsonOk({ regattas: [], athletes: [], clubs: [] });

    // Search regattas by name/location in parallel with athlete/club search in entries
    const [regattaRes, athleteRes, clubRes] = await Promise.all([
      // Regattas matching name
      supabase
        .from("regattas")
        .select("id, name, event_date, end_date, location, state, host_club, event_type, status, level")
        .or(`name.ilike.%${q}%,location.ilike.%${q}%,host_club.ilike.%${q}%`)
        .order("event_date", { ascending: false })
        .limit(20),

      // Entries where athlete name matches
      supabase
        .from("regatta_entries")
        .select(`
          id, crew_name, club, athletes, placement, finish_time,
          race:regatta_races(event_name, boat_class, round),
          regatta:regattas(id, name, event_date, location)
        `)
        .ilike("athletes::text", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(30),

      // Entries where club matches
      supabase
        .from("regatta_entries")
        .select(`
          id, crew_name, club, athletes, placement, finish_time,
          race:regatta_races(event_name, boat_class, round),
          regatta:regattas(id, name, event_date, location)
        `)
        .ilike("club", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    return jsonOk({
      regattas: regattaRes.data ?? [],
      athletes: athleteRes.data ?? [],
      clubs: clubRes.data ?? [],
    });
  }

  // ── Fetch Results for a specific regatta ─────────────────────────────────────
  if (action === "fetch_results") {
    if (!regatta_id) return new Response(JSON.stringify({ error: "regatta_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Check cache
    const { data: existingRaces } = await supabase
      .from("regatta_races")
      .select("id")
      .eq("regatta_id", regatta_id)
      .limit(1);

    const hasCache = (existingRaces?.length ?? 0) > 0;

    if (hasCache && !force_refresh) {
      const { data: races } = await supabase
        .from("regatta_races")
        .select("*, entries:regatta_entries(*)")
        .eq("regatta_id", regatta_id)
        .order("event_name");
      return jsonOk({ races: races ?? [], cached: true });
    }

    // Fetch from CrewTimer
    const { data: regatta } = await supabase
      .from("regattas")
      .select("crewtimer_id")
      .eq("id", regatta_id)
      .maybeSingle();

    if (regatta?.crewtimer_id) {
      const { data: resultsData, error: resErr } = await safeFetch(`${CT_BASE}/regatta/${regatta.crewtimer_id}/results`);
      if (!resErr && resultsData) {
        const rawRaces: any[] = resultsData.races ?? resultsData.Races ?? resultsData.events ?? [];
        const parsedRaces = rawRaces.map((r: any) => parseRace(r, regatta_id));
        await upsertRacesAndEntries(supabase, regatta_id, parsedRaces);
      }
    }

    const { data: races } = await supabase
      .from("regatta_races")
      .select("*, entries:regatta_entries(*)")
      .eq("regatta_id", regatta_id)
      .order("event_name");

    return jsonOk({ races: races ?? [], cached: false });
  }

  // ── Upcoming ─────────────────────────────────────────────────────────────────
  if (action === "upcoming") {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("regattas")
      .select("id, name, event_date, end_date, location, state, host_club, event_type, level, status")
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(60);
    return jsonOk({ regattas: data ?? [] });
  }

  // ── Search Regattas (simple, backward-compat) ────────────────────────────────
  if (action === "search_regattas") {
    let q = supabase.from("regattas").select("*").order("event_date", { ascending: false }).limit(60);
    if (query) q = q.ilike("name", `%${query}%`);
    if (body.state) q = q.eq("state", body.state);
    if (body.event_type) q = q.eq("event_type", body.event_type);
    const { data } = await q;
    return jsonOk({ regattas: data ?? [] });
  }

  return new Response(JSON.stringify({ error: "Unknown action" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
