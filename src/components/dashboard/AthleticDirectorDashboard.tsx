import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Users, TrendingUp, AlertTriangle, Megaphone, BarChart3, Trophy, Calendar,
  CheckCircle2, XCircle, Activity, Download, ChevronRight, ArrowLeft,
  Circle, Bell,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

function formatSplit(s: number | null | undefined): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

type TrafficLight = "green" | "yellow" | "red";

interface Props { profile: any; }

// ── Tabs ─────────────────────────────────────────────────────────────────────
type TopTab = "overview" | "compare" | "alerts" | "announce";
type ProgramTab = "roster" | "performance" | "attendance" | "regattas" | "workouts" | "coaches";

export default function AthleticDirectorDashboard({ profile }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [topTab, setTopTab] = useState<TopTab>("overview");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [programTab, setProgramTab] = useState<ProgramTab>("roster");
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annUrgent, setAnnUrgent] = useState(false);

  // ── Fetch org + teams ─────────────────────────────────────────────────────
  const { data: orgs = [] } = useQuery({
    queryKey: ["ad-orgs", profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, name, logo_url");
      return data || [];
    },
  });

  const org = orgs[0]; // primary org

  const { data: orgTeams = [] } = useQuery({
    queryKey: ["ad-org-teams", org?.id],
    queryFn: async () => {
      if (!org?.id) return [];
      const { data } = await supabase
        .from("organization_teams")
        .select(`
          team_id,
          team:teams(
            id, name, logo_url, primary_color,
            team_members(user_id, profile:profiles(id, full_name, username, best_2k_seconds, role)),
            team_coaches:team_coaches(user_id, role, profile:profiles(full_name, username))
          )
        `)
        .eq("organization_id", org.id);
      return (data || []).map((d: any) => d.team).filter(Boolean);
    },
    enabled: !!org?.id,
  });

  // Also include teams the user is a direct AD of (not through org)
  const { data: directAdTeams = [] } = useQuery({
    queryKey: ["ad-direct-teams", profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_athletic_directors" as any)
        .select(`team:teams(id, name, logo_url, primary_color,
          team_members(user_id, profile:profiles(id, full_name, username, best_2k_seconds, role)),
          team_coaches:team_coaches(user_id, role, profile:profiles(full_name, username))
        )`)
        .eq("user_id", profile.id)
        .eq("status", "accepted");
      return (data || []).map((d: any) => d.team).filter(Boolean);
    },
    enabled: !!profile?.id,
  });

  const allTeams: any[] = [
    ...orgTeams,
    ...directAdTeams.filter((t: any) => !orgTeams.some((ot: any) => ot.id === t.id)),
  ];
  const teamIds = allTeams.map((t: any) => t.id).filter(Boolean);

  // ── Aggregate erg data ────────────────────────────────────────────────────
  const { data: ergData = [] } = useQuery({
    queryKey: ["ad-erg", teamIds],
    queryFn: async () => {
      if (!teamIds.length) return [];
      const allMemberIds = allTeams.flatMap((t: any) =>
        (t.team_members || []).map((m: any) => m.user_id)
      );
      if (!allMemberIds.length) return [];
      const { data } = await supabase
        .from("erg_workouts")
        .select("user_id, workout_date, distance, best_split_seconds")
        .in("user_id", allMemberIds)
        .gte("workout_date", daysAgo(90));
      return data || [];
    },
    enabled: teamIds.length > 0,
  });

  const { data: attendanceData = [] } = useQuery({
    queryKey: ["ad-attendance", teamIds],
    queryFn: async () => {
      if (!teamIds.length) return [];
      const { data } = await supabase
        .from("attendance_records" as any)
        .select("user_id, team_id, practice_date, status")
        .in("team_id", teamIds)
        .gte("practice_date", daysAgo(90));
      return data || [];
    },
    enabled: teamIds.length > 0,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["ad-alerts", teamIds],
    queryFn: async () => {
      if (!teamIds.length) return [];
      const { data } = await supabase
        .from("org_alerts" as any)
        .select("*")
        .in("team_id", teamIds)
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: teamIds.length > 0,
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["ad-announcements", org?.id],
    queryFn: async () => {
      if (!org?.id) return [];
      const { data } = await supabase
        .from("org_announcements" as any)
        .select("*")
        .eq("org_id", org.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!org?.id,
  });

  // ── Stats helpers ─────────────────────────────────────────────────────────
  function teamMemberIds(team: any): string[] {
    return (team.team_members || []).map((m: any) => m.user_id);
  }

  function teamAvg2k(team: any): number | null {
    const members = teamMemberIds(team);
    const splits = (team.team_members || [])
      .map((m: any) => m.profile?.best_2k_seconds)
      .filter(Boolean);
    if (!splits.length) return null;
    return splits.reduce((a: number, b: number) => a + b, 0) / splits.length;
  }

  function teamAttendance(team: any): number {
    const mIds = new Set(teamMemberIds(team));
    const teamRecs = attendanceData.filter((r: any) => mIds.has(r.user_id) && r.team_id === team.id);
    if (!teamRecs.length) return 0;
    return Math.round((teamRecs.filter((r: any) => r.status === "present").length / teamRecs.length) * 100);
  }

  function teamMetersThisWeek(team: any): number {
    const mIds = new Set(teamMemberIds(team));
    return ergData
      .filter((w: any) => mIds.has(w.user_id) && w.workout_date >= daysAgo(7))
      .reduce((s: number, w: any) => s + (w.distance || 0), 0);
  }

  function trafficLight(team: any): TrafficLight {
    const att = teamAttendance(team);
    const metersWeek = teamMetersThisWeek(team);
    const teamAlerts = alerts.filter((a: any) => a.team_id === team.id);
    const seriousAlerts = teamAlerts.filter((a: any) =>
      a.alert_type === "performance_decline" || a.alert_type === "no_activity"
    );
    if (att < 60 || seriousAlerts.length >= 2 || metersWeek === 0) return "red";
    if (att < 80 || teamAlerts.length > 0) return "yellow";
    return "green";
  }

  function lightColor(light: TrafficLight) {
    return { green: "text-green-500", yellow: "text-amber-500", red: "text-red-500" }[light];
  }

  function lightBg(light: TrafficLight) {
    return { green: "border-green-200 bg-green-50 dark:bg-green-950/20", yellow: "border-amber-200 bg-amber-50 dark:bg-amber-950/20", red: "border-red-200 bg-red-50 dark:bg-red-950/20" }[light];
  }

  // ── Org-wide stats ────────────────────────────────────────────────────────
  const totalAthletes = allTeams.reduce((s: number, t: any) =>
    s + (t.team_members?.filter((m: any) => m.profile?.role !== "coach") || []).length, 0);
  const totalCoaches = allTeams.reduce((s: number, t: any) =>
    s + (t.team_coaches?.length || 0), 0);
  const totalMeters = ergData.reduce((s: number, w: any) => s + (w.distance || 0), 0);
  const allSplits = allTeams.flatMap((t: any) =>
    (t.team_members || []).map((m: any) => m.profile?.best_2k_seconds).filter(Boolean)
  );
  const avgOrg2k = allSplits.length ? allSplits.reduce((a: number, b: number) => a + b, 0) / allSplits.length : null;
  const allAttRecs = attendanceData;
  const overallAttendance = allAttRecs.length
    ? Math.round((allAttRecs.filter((r: any) => r.status === "present").length / allAttRecs.length) * 100)
    : 0;

  // ── Announcements ─────────────────────────────────────────────────────────
  const postAnnouncement = useMutation({
    mutationFn: async () => {
      if (!annTitle.trim() || !annBody.trim()) throw new Error("Title and body required");
      const { error } = await supabase.from("org_announcements" as any).insert({
        org_id: org?.id || null,
        posted_by: profile.id,
        title: annTitle.trim(),
        body: annBody.trim(),
        is_urgent: annUrgent,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Announcement posted" });
      setAnnTitle(""); setAnnBody(""); setAnnUrgent(false);
      qc.invalidateQueries({ queryKey: ["ad-announcements"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resolveAlert = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("org_alerts" as any).update({ resolved: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ad-alerts"] }),
  });

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportRosterCSV(team: any) {
    const headers = ["Name", "Role", "Best 2K", "Attendance %"];
    const rows = (team.team_members || []).map((m: any) => {
      const mIds = new Set([m.user_id]);
      const attRecs = attendanceData.filter((r: any) => mIds.has(r.user_id) && r.team_id === team.id);
      const attRate = attRecs.length ? Math.round((attRecs.filter((r: any) => r.status === "present").length / attRecs.length) * 100) : 0;
      return [
        m.profile?.full_name || m.profile?.username || "Unknown",
        m.profile?.role || "athlete",
        formatSplit(m.profile?.best_2k_seconds),
        `${attRate}%`,
      ];
    });
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${team.name}-roster.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Recharts data helpers ─────────────────────────────────────────────────
  function weeklyAttendanceData(team: any) {
    const weeks: Record<string, { present: number; total: number }> = {};
    const mIds = new Set(teamMemberIds(team));
    attendanceData
      .filter((r: any) => mIds.has(r.user_id) && r.team_id === team.id)
      .forEach((r: any) => {
        const d = new Date(r.practice_date);
        d.setDate(d.getDate() - d.getDay());
        const wk = d.toISOString().split("T")[0];
        if (!weeks[wk]) weeks[wk] = { present: 0, total: 0 };
        weeks[wk].total++;
        if (r.status === "present") weeks[wk].present++;
      });
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ week: week.slice(5), rate: Math.round((v.present / v.total) * 100) }));
  }

  function comparisonChartData() {
    return allTeams.map((t: any) => ({
      name: t.name.length > 12 ? t.name.slice(0, 12) + "…" : t.name,
      "Avg 2K (s)": teamAvg2k(t) ? Math.round(teamAvg2k(t)!) : 0,
      "Attendance %": teamAttendance(t),
      "Meters (k)": Math.round(teamMetersThisWeek(t) / 1000),
    }));
  }

  // ── Selected team detail ──────────────────────────────────────────────────
  const selectedTeam = allTeams.find((t: any) => t.id === selectedTeamId);

  if (selectedTeam) {
    return <ProgramDetail
      team={selectedTeam}
      tab={programTab}
      setTab={setProgramTab}
      ergData={ergData}
      attendanceData={attendanceData}
      alerts={alerts.filter((a: any) => a.team_id === selectedTeam.id)}
      onBack={() => setSelectedTeamId(null)}
      formatSplit={formatSplit}
      weeklyAttendanceData={weeklyAttendanceData}
      exportRosterCSV={exportRosterCSV}
    />;
  }

  // ── Top-level tabs ────────────────────────────────────────────────────────
  const TAB_ITEMS: { id: TopTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "compare", label: "Compare Programs" },
    { id: "alerts", label: `Alerts ${alerts.length > 0 ? `(${alerts.length})` : ""}` },
    { id: "announce", label: "Announcements" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Athletic Director Dashboard</h2>
          {org && <p className="text-xs text-muted-foreground">{org.name} · {allTeams.length} programs</p>}
        </div>
        {alerts.filter((a: any) => !a.resolved).length > 0 && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {alerts.filter((a: any) => !a.resolved).length} alerts
          </Badge>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border overflow-x-auto scrollbar-none">
        {TAB_ITEMS.map(t => (
          <button key={t.id} onClick={() => setTopTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              topTab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {topTab === "overview" && (
        <div className="space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total Athletes", value: totalAthletes, icon: Users },
              { label: "Total Coaches", value: totalCoaches, icon: Users },
              { label: "Meters (Season)", value: `${(totalMeters / 1_000_000).toFixed(1)}M`, icon: Activity },
              { label: "Avg Org 2K", value: formatSplit(avgOrg2k), icon: TrendingUp },
              { label: "Attendance", value: `${overallAttendance}%`, icon: CheckCircle2 },
              { label: "Open Alerts", value: alerts.filter((a: any) => !a.resolved).length, icon: AlertTriangle },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-3 text-center">
                <Icon className="h-4 w-4 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-xl font-black text-foreground">{String(value)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>

          {/* Program cards */}
          {allTeams.length === 0 ? (
            <div className="rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
              No programs found. Create an organization and add teams, or accept team AD invitations.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allTeams.map((team: any) => {
                const light = trafficLight(team);
                const headCoach = (team.team_coaches || []).find((c: any) => c.role === "head_coach");
                const coachName = headCoach?.profile?.full_name || headCoach?.profile?.username || "—";
                const athleteCount = (team.team_members || []).filter((m: any) => m.profile?.role !== "coach").length;
                const avg2k = teamAvg2k(team);
                const att = teamAttendance(team);
                const meters = teamMetersThisWeek(team);
                const teamAlertCount = alerts.filter((a: any) => a.team_id === team.id && !a.resolved).length;

                return (
                  <button
                    key={team.id}
                    onClick={() => { setSelectedTeamId(team.id); setProgramTab("roster"); }}
                    className={`text-left rounded-2xl border p-4 hover:shadow-md transition-all ${lightBg(light)}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <Circle className={`h-3 w-3 fill-current ${lightColor(light)}`} />
                        <span className="font-bold text-foreground">{team.name}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">Head Coach: {coachName}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-base font-black text-foreground">{athleteCount}</p>
                        <p className="text-[10px] text-muted-foreground">Athletes</p>
                      </div>
                      <div>
                        <p className="text-base font-black text-foreground">{formatSplit(avg2k)}</p>
                        <p className="text-[10px] text-muted-foreground">Avg 2K</p>
                      </div>
                      <div>
                        <p className="text-base font-black text-foreground">{att}%</p>
                        <p className="text-[10px] text-muted-foreground">Attendance</p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{(meters / 1000).toFixed(1)}k m this week</span>
                      {teamAlertCount > 0 && (
                        <span className="text-amber-600 font-semibold flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {teamAlertCount} alert{teamAlertCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Compare ──────────────────────────────────────────────────────── */}
      {topTab === "compare" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">All programs compared side by side.</p>
          {allTeams.length < 2 ? (
            <p className="text-sm text-muted-foreground">Need at least 2 programs to compare.</p>
          ) : (
            <>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-3">Attendance Rate by Program</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={comparisonChartData()} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="Attendance %" fill="#0a1628" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold mb-3">Weekly Meters by Program</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={comparisonChartData()} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="Meters (k)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Alerts ───────────────────────────────────────────────────────── */}
      {topTab === "alerts" && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
              No open alerts. All programs look healthy.
            </div>
          ) : (
            alerts.map((alert: any) => {
              const team = allTeams.find((t: any) => t.id === alert.team_id);
              const Icon = alert.alert_type === "low_attendance" || alert.alert_type === "consecutive_absences"
                ? XCircle : alert.alert_type === "no_activity" ? Activity : AlertTriangle;
              return (
                <div key={alert.id} className="flex items-start gap-3 border border-border rounded-xl p-3.5">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${
                    alert.alert_type === "performance_decline" || alert.alert_type === "no_activity" ? "text-red-500" : "text-amber-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {team?.name} · {new Date(alert.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedTeamId(alert.team_id)}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => resolveAlert.mutate(alert.id)}>Resolve</Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Announcements ────────────────────────────────────────────────── */}
      {topTab === "announce" && (
        <div className="space-y-5">
          {org && (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Post Org-Wide Announcement
              </p>
              <Input placeholder="Title" value={annTitle} onChange={e => setAnnTitle(e.target.value)} />
              <Textarea placeholder="Message to all teams…" value={annBody} onChange={e => setAnnBody(e.target.value)} className="min-h-[80px]" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={annUrgent} onCheckedChange={setAnnUrgent} id="urgent-toggle" />
                  <Label htmlFor="urgent-toggle" className="text-sm flex items-center gap-1.5 cursor-pointer">
                    <Bell className="h-3.5 w-3.5 text-red-500" />
                    Urgent (sends push notification)
                  </Label>
                </div>
                <Button size="sm" onClick={() => postAnnouncement.mutate()} disabled={postAnnouncement.isPending}>
                  Post
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {announcements.length === 0 && <p className="text-sm text-muted-foreground">No announcements yet.</p>}
            {announcements.map((ann: any) => (
              <div key={ann.id} className="border border-border rounded-xl p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  {ann.is_urgent && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Urgent</Badge>}
                  <p className="font-semibold text-sm">{ann.title}</p>
                </div>
                <p className="text-sm text-muted-foreground">{ann.body}</p>
                <p className="text-xs text-muted-foreground mt-1.5">{new Date(ann.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Program Detail View ───────────────────────────────────────────────────────
function ProgramDetail({ team, tab, setTab, ergData, attendanceData, alerts, onBack, formatSplit, weeklyAttendanceData, exportRosterCSV }: any) {
  const TABS: { id: ProgramTab; label: string }[] = [
    { id: "roster", label: "Roster" },
    { id: "performance", label: "Performance" },
    { id: "attendance", label: "Attendance" },
    { id: "regattas", label: "Regattas" },
    { id: "workouts", label: "Workouts" },
    { id: "coaches", label: "Coaches" },
  ];

  const memberIds = new Set((team.team_members || []).map((m: any) => m.user_id));
  const teamErg = ergData.filter((w: any) => memberIds.has(w.user_id));
  const teamAttendance = attendanceData.filter((r: any) => memberIds.has(r.user_id) && r.team_id === team.id);

  // Roster: athlete list with stats
  const athletes = (team.team_members || []).filter((m: any) => m.profile?.role !== "coach");
  const coachList = team.team_coaches || [];

  // Per-athlete attendance
  function athleteAttendance(userId: string) {
    const recs = teamAttendance.filter((r: any) => r.user_id === userId);
    if (!recs.length) return null;
    return Math.round((recs.filter((r: any) => r.status === "present").length / recs.length) * 100);
  }

  // Weekly avg 2k trend for team
  function teamWeeklyAvg2k() {
    const byWeek: Record<string, number[]> = {};
    teamErg.filter((w: any) => w.best_split_seconds).forEach((w: any) => {
      const d = new Date(w.workout_date);
      d.setDate(d.getDate() - d.getDay());
      const wk = d.toISOString().split("T")[0];
      if (!byWeek[wk]) byWeek[wk] = [];
      byWeek[wk].push(w.best_split_seconds);
    });
    return Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, splits]) => ({
        week: wk.slice(5),
        avg2k: Math.round(splits.reduce((a: number, b: number) => a + b, 0) / splits.length),
      }));
  }

  const attChartData = weeklyAttendanceData(team);
  const avg2kTrend = teamWeeklyAvg2k();

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        All Programs
      </button>

      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground text-base">{team.name}</h3>
        {tab === "roster" && (
          <Button size="sm" variant="outline" onClick={() => exportRosterCSV(team)}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Roster */}
      {tab === "roster" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-3 text-xs font-semibold text-muted-foreground">Athlete</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted-foreground text-center">Best 2K</th>
                <th className="py-2 px-3 text-xs font-semibold text-muted-foreground text-center">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((m: any) => {
                const att = athleteAttendance(m.user_id);
                const flagAtt = att !== null && att < 70;
                return (
                  <tr key={m.user_id} className="border-b border-border hover:bg-muted/30">
                    <td className="py-2 px-3 font-medium">{m.profile?.full_name || m.profile?.username || "Unknown"}</td>
                    <td className="py-2 px-3 text-center font-mono text-sm">{formatSplit(m.profile?.best_2k_seconds)}</td>
                    <td className={`py-2 px-3 text-center text-sm font-semibold ${flagAtt ? "text-red-500" : "text-foreground"}`}>
                      {att !== null ? `${att}%` : "—"}
                      {flagAtt && <span className="ml-1 text-xs">⚠️</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {athletes.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No athletes on roster.</p>}
        </div>
      )}

      {/* Performance */}
      {tab === "performance" && (
        <div className="space-y-4">
          {avg2kTrend.length > 1 ? (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold mb-3">Team Avg 2K Split Trend (seconds)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={avg2kTrend} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => [formatSplit(v), "Avg 2K"]} />
                  <Line type="monotone" dataKey="avg2k" stroke="#0a1628" strokeWidth={2} dot={{ fill: "#0a1628", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Not enough 2K test data to show trend.</p>
          )}

          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold mb-2">Top Improvers (by best 2K)</p>
            <div className="space-y-1.5">
              {athletes.slice(0, 5).map((m: any, i: number) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{i + 1}. {m.profile?.full_name || m.profile?.username}</span>
                  <span className="font-mono font-semibold">{formatSplit(m.profile?.best_2k_seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attendance */}
      {tab === "attendance" && (
        <div className="space-y-4">
          {attChartData.length > 0 ? (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold mb-3">Weekly Attendance Rate</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={attChartData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => [`${v}%`, "Attendance"]} />
                  <Line type="monotone" dataKey="rate" stroke="#0a1628" strokeWidth={2} dot={{ fill: "#0a1628", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No attendance data logged.</p>
          )}
          <div className="space-y-1.5">
            {athletes
              .map((m: any) => ({ ...m, att: athleteAttendance(m.user_id) }))
              .filter((m: any) => m.att !== null)
              .sort((a: any, b: any) => a.att - b.att)
              .map((m: any) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm border-b border-border py-1.5">
                  <span className={m.att < 70 ? "text-red-600 font-semibold" : "text-foreground"}>
                    {m.profile?.full_name || m.profile?.username}
                    {m.att < 70 && " ⚠️"}
                  </span>
                  <span className={`font-semibold ${m.att < 70 ? "text-red-600" : "text-foreground"}`}>{m.att}%</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Regattas */}
      {tab === "regattas" && (
        <p className="text-sm text-muted-foreground text-center py-8">Regatta results appear here when logged by the coaching staff.</p>
      )}

      {/* Workouts */}
      {tab === "workouts" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Assigned workout completion rates for this program.</p>
          <p className="text-sm text-muted-foreground text-center py-8">Workout assignment data appears here when coaches assign and athletes complete workouts.</p>
        </div>
      )}

      {/* Coaches */}
      {tab === "coaches" && (
        <div className="space-y-2">
          {coachList.length === 0 && <p className="text-sm text-muted-foreground">No coaching staff listed.</p>}
          {coachList.map((c: any) => (
            <div key={c.user_id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5 text-sm">
              <div>
                <p className="font-medium">{c.profile?.full_name || c.profile?.username || "Unknown"}</p>
                <p className="text-xs text-muted-foreground capitalize">{c.role?.replace(/_/g, " ")}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerts for this program */}
      {alerts.length > 0 && (
        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Alerts</p>
          {alerts.map((a: any) => (
            <div key={a.id} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
