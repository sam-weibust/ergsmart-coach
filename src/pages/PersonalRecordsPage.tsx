import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Trophy, TrendingUp, Star, ArrowLeft, Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";

const DISTANCE_ORDER = ["2k", "5k", "6k", "60min", "30min", "10k"];

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtImprovement(diff: number): string {
  const m = Math.floor(Math.abs(diff) / 60);
  const s = Math.round(Math.abs(diff) % 60);
  return m > 0 ? `-${m}m ${s}s` : `-${s}s`;
}

function isNew(dateStr: string): boolean {
  const d = new Date(dateStr);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  return d >= thirtyDaysAgo;
}

export default function PersonalRecordsPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setCurrentUser(session?.user ?? null));
  }, []);

  const { data: profileData } = useQuery({
    queryKey: ["pr-profile", username],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .eq("username", username!)
        .maybeSingle();
      return data;
    },
    enabled: !!username,
  });

  const { data: records = [] } = useQuery({
    queryKey: ["personal-records", profileData?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("personal_records" as any)
        .select("*")
        .eq("user_id", profileData!.id)
        .order("set_at", { ascending: false });
      return data || [];
    },
    enabled: !!profileData?.id,
  });

  // Group records by distance label, keep best per label
  const prsByDistance = (records as any[]).reduce((acc: Record<string, any[]>, r) => {
    if (!acc[r.distance_label]) acc[r.distance_label] = [];
    acc[r.distance_label].push(r);
    return acc;
  }, {});

  const bestPRs = Object.entries(prsByDistance).map(([label, recs]) => {
    const sorted = (recs as any[]).sort((a, b) => a.time_seconds - b.time_seconds);
    return { label, best: sorted[0], history: sorted };
  }).sort((a, b) => {
    const ia = DISTANCE_ORDER.indexOf(a.label);
    const ib = DISTANCE_ORDER.indexOf(b.label);
    if (ia === -1 && ib === -1) return a.label.localeCompare(b.label);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isOwnProfile = currentUser && profileData && currentUser.id === profileData.id;

  return (
    <>
      <head>
        <title>{profileData?.full_name ? `${profileData.full_name}'s PRs` : "Personal Records"} | CrewSync</title>
        <meta name="description" content={`Personal records for ${profileData?.full_name || username} on CrewSync rowing platform.`} />
      </head>

      <div className="min-h-screen bg-[#0a1628]">
        {/* Header */}
        <header className="border-b border-white/10 bg-[#0a1628] sticky top-0 z-20">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/70 hover:text-white hover:bg-white/10 gap-2 -ml-2"
                onClick={() => navigate(`/athlete/${username}`)}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <img src={crewsyncLogo} alt="CrewSync" className="h-7 w-7 rounded-lg border border-white/20" />
              <span className="text-white/70 text-sm">CrewSync</span>
            </div>
          </div>
        </header>

        <div className="container mx-auto max-w-4xl px-4 py-8">
          {/* Title */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Trophy className="h-8 w-8 text-[#f59e0b]" />
                Personal Records
              </h1>
              {profileData?.full_name && (
                <p className="text-white/60 mt-1">{profileData.full_name}</p>
              )}
            </div>
            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10 gap-2"
            >
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {copied ? "Copied!" : "Share PRs"}
            </Button>
          </div>

          {bestPRs.length === 0 ? (
            <div className="text-center py-24">
              <Trophy className="h-16 w-16 mx-auto mb-4 text-white/20" />
              <p className="text-white/50 text-lg">No personal records yet</p>
              {isOwnProfile && (
                <p className="text-white/30 text-sm mt-2">Log workouts to start tracking your PRs</p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* PR Cards grid */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {bestPRs.map(({ label, best, history }) => (
                  <PRCard key={label} label={label} best={best} history={history} />
                ))}
              </div>

              {/* Timeline chart per distance */}
              {bestPRs.filter(p => p.history.length > 1).map(({ label, history }) => (
                <PRTimeline key={label} label={label} history={history} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PRCard({ label, best, history }: { label: string; best: any; history: any[] }) {
  const newPR = isNew(best.set_at);

  return (
    <Card className="bg-gradient-to-br from-[#112240] to-[#0a1628] border-white/10 text-white overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
            <p className="text-3xl font-bold text-white">{fmtTime(best.time_seconds)}</p>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <Trophy className="h-6 w-6 text-[#f59e0b]" />
            {newPR && (
              <Badge className="bg-[#2d6be4] text-white text-xs border-none">New!</Badge>
            )}
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <p className="text-white/40">{new Date(best.set_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>

          {best.improvement_seconds && best.improvement_seconds > 0 && (
            <p className="text-green-400 font-semibold text-xs">
              {fmtImprovement(best.improvement_seconds)} improvement
            </p>
          )}

          {best.watts && (
            <div className="flex gap-3 mt-2 text-xs text-white/50">
              <span>{Math.round(best.watts)}W</span>
              {best.stroke_rate && <span>{best.stroke_rate} spm</span>}
            </div>
          )}
        </div>

        {/* Mini sparkline */}
        {history.length > 1 && (
          <div className="mt-3 h-12">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.slice().reverse().map((h, i) => ({ i, t: h.time_seconds }))}>
                <Line type="monotone" dataKey="t" stroke="#2d6be4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="text-white/25 text-xs mt-2">{history.length} attempt{history.length !== 1 ? "s" : ""}</p>
      </CardContent>
    </Card>
  );
}

function PRTimeline({ label, history }: { label: string; history: any[] }) {
  const data = history
    .slice()
    .reverse()
    .map(h => ({
      date: new Date(h.set_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      time: h.time_seconds,
      label: fmtTime(h.time_seconds),
    }));

  return (
    <Card className="bg-gradient-to-br from-[#112240] to-[#0a1628] border-white/10 text-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#2d6be4]" />
          {label} — PR Progression
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                domain={["auto", "auto"]}
                reversed
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => fmtTime(v)}
                width={50}
              />
              <Tooltip
                contentStyle={{ background: "#112240", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                formatter={(v: any) => [fmtTime(v), label]}
              />
              <Line
                type="monotone"
                dataKey="time"
                stroke="#2d6be4"
                strokeWidth={2.5}
                dot={{ fill: "#2d6be4", r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "#f59e0b" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
