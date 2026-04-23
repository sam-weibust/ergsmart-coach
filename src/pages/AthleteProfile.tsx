import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  MapPin, School, Users, Globe, Instagram, Twitter, Youtube,
  ExternalLink, UserPlus, UserCheck, Eye, GraduationCap, TrendingUp,
  Dumbbell, BarChart3, Heart, Star, ArrowLeft, Mail, Link2,
  RefreshCw, Unplug, Plug, Trophy, Activity
} from "lucide-react";
import { CalendarHeatmap } from "@/components/dashboard/CalendarHeatmap";
import { useToast } from "@/hooks/use-toast";
import { c2Connect, c2Sync, c2Disconnect, whoopConnect, whoopSync, whoopDisconnect } from "@/lib/api";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";
import { getSessionUser } from '@/lib/getUser';
import { WhoopSection } from "@/components/dashboard/WhoopSection";

const fmtSplit = (s: string | null) => {
  if (!s) return "—";
  if (typeof s === "string" && s.includes(":")) return s;
  const sec = parseFloat(String(s));
  if (isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const remainder = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${remainder}`;
};

const cmToDisplay = (cm: number | null) => {
  if (!cm) return "—";
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${ft}'${inches}"`;
};

const kgToLbs = (kg: number | null) => (kg ? Math.round(kg * 2.20462) + " lbs" : "—");

const wattFromSplit = (splitStr: string | null) => {
  if (!splitStr) return null;
  let sec = 0;
  if (typeof splitStr === "string" && splitStr.includes(":")) {
    const [m, s] = splitStr.split(":").map(Number);
    sec = m * 60 + s;
  } else {
    sec = parseFloat(String(splitStr));
  }
  if (!sec || sec <= 0) return null;
  return (2.80 / Math.pow(sec / 500, 3)).toFixed(0);
};

export default function AthleteProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Whoop state — must be declared unconditionally before any early returns
  const [whoopConnected, setWhoopConnected] = useState<boolean | null>(null);
  const [whoopLastSync, setWhoopLastSync] = useState<string | null>(null);
  const [whoopSyncing, setWhoopSyncing] = useState(false);
  const [whoopConnecting, setWhoopConnecting] = useState(false);

  // Concept2 state — must be declared unconditionally before any early returns
  const [c2Connected, setC2Connected] = useState<boolean | null>(null);
  const [c2LastSync, setC2LastSync] = useState<string | null>(null);
  const [c2Syncing, setC2Syncing] = useState(false);
  const [c2Connecting, setC2Connecting] = useState(false);
  const [c2ImportedCount, setC2ImportedCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setCurrentUser(session?.user ?? null));
  }, []);

  const { data: profileData, isLoading } = useQuery({
    queryKey: ["public-athlete", username],
    queryFn: async () => {
      const { data: baseProfile } = await supabase
        .from("profiles")
        .select("id, full_name, username, height, weight, user_type")
        .eq("username", username)
        .maybeSingle();

      if (!baseProfile) return null;

      const [apRes, ergRes, strengthRes, followersRes, followingRes, combineRes, academicsRes] = await Promise.all([
        supabase.from("athlete_profiles").select("*").eq("user_id", baseProfile.id).maybeSingle(),
        supabase.from("erg_workouts").select("*").eq("user_id", baseProfile.id).order("workout_date", { ascending: false }).limit(20),
        supabase.from("strength_workouts").select("*").eq("user_id", baseProfile.id).order("workout_date", { ascending: false }).limit(10),
        supabase.from("profile_follows").select("id").eq("following_id", baseProfile.id),
        supabase.from("profile_follows").select("id").eq("follower_id", baseProfile.id),
        (supabase as any).from("combine_entries").select("combine_score, two_k_seconds, six_k_seconds, two_k_watts").eq("user_id", baseProfile.id).maybeSingle(),
        supabase.from("athlete_academics").select("*").eq("user_id", baseProfile.id).maybeSingle(),
      ]);

      const ap = apRes.data;
      if (!ap?.is_public) return { notPublic: true };

      const ergs = ergRes.data || [];
      const bestErg = ergs.reduce((best: any, w: any) => {
        if (!w.avg_split) return best;
        if (!best || String(w.avg_split) < String(best.avg_split)) return w;
        return best;
      }, null);

      const recentMonth = ergs.filter((w: any) => {
        const d = new Date(w.workout_date);
        const now = new Date();
        return (now.getTime() - d.getTime()) < 30 * 24 * 60 * 60 * 1000;
      });
      const totalVolume = recentMonth.reduce((sum: number, w: any) => sum + (w.distance || 0), 0);

      return {
        base: baseProfile,
        ap,
        bestErg,
        ergs: ergs.slice(0, 5),
        strengthCount: (strengthRes.data || []).length,
        totalVolume,
        followers: (followersRes.data || []).length,
        following: (followingRes.data || []).length,
        combine: combineRes.data || null,
        academics: academicsRes.data || null,
      };
    },
  });

  const { data: isFollowing } = useQuery({
    queryKey: ["is-following", profileData?.base?.id, currentUser?.id],
    enabled: !!currentUser && !!profileData?.base?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profile_follows")
        .select("id")
        .eq("follower_id", currentUser.id)
        .eq("following_id", profileData.base.id)
        .maybeSingle();
      return !!data;
    },
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) { navigate("/auth"); return; }
      if (isFollowing) {
        await supabase.from("profile_follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profileData.base.id);
      } else {
        await supabase.from("profile_follows").insert({
          follower_id: currentUser.id,
          following_id: profileData.base.id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["is-following"] });
      queryClient.invalidateQueries({ queryKey: ["public-athlete", username] });
    },
  });

  // Sync C2 state when profileData loads — must be before early returns
  useEffect(() => {
    if (!profileData || profileData.notPublic || !profileData.ap) return;
    const ap = profileData.ap;
    const isOwn = currentUser?.id === profileData.base?.id;
    if (!isOwn) return;
    setC2Connected(!!ap.last_concept2_sync);
    setC2LastSync(ap.last_concept2_sync ?? null);
    const params = new URLSearchParams(window.location.search);
    if (params.get("c2") === "connected" && params.get("imported")) {
      setC2Connected(true);
      setC2ImportedCount(parseInt(params.get("imported")!, 10));
    }
    if (params.get("whoop") === "connected") {
      setWhoopConnected(true);
    }
  }, [profileData, currentUser]);

  // Check Whoop connection status
  useEffect(() => {
    if (!currentUser || !profileData?.base?.id) return;
    if (currentUser.id !== profileData.base.id) return;
    supabase.from("whoop_connections")
      .select("last_sync_at")
      .eq("user_id", currentUser.id)
      .maybeSingle()
      .then(({ data }) => {
        setWhoopConnected(!!data);
        setWhoopLastSync(data?.last_sync_at ?? null);
      });
  }, [currentUser, profileData?.base?.id]);

  // Record view + increment count
  useEffect(() => {
    if (!profileData?.base?.id) return;
    const record = async () => {
      const user = await getSessionUser();
      const viewerType = user
        ? ((user as any).user_metadata?.user_type === "coach" ? "coach" : "athlete")
        : "anonymous";

      await supabase.from("profile_views").insert({
        profile_user_id: profileData.base.id,
        viewer_id: user?.id || null,
        viewer_type: viewerType,
      });

      await supabase.rpc("increment_profile_view", { target_user_id: profileData.base.id }).catch(() => {});

      if (viewerType === "coach") {
        await supabase.rpc("increment_coach_view", { target_user_id: profileData.base.id }).catch(() => {});
      }
    };
    record();
  }, [profileData?.base?.id]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied!" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!profileData || profileData.notPublic) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
        <img src={crewsyncLogo} alt="CrewSync" className="h-16 w-16 rounded-2xl" />
        <h1 className="text-2xl font-bold">Profile not found</h1>
        <p className="text-muted-foreground">This athlete profile is private or doesn't exist.</p>
        <Button onClick={() => navigate("/")} variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Go Home</Button>
      </div>
    );
  }

  const { base, ap, bestErg, ergs, strengthCount, totalVolume, followers, combine, academics } = profileData;
  const watts = wattFromSplit(bestErg?.avg_split);
  const wkg = watts && base.weight ? (parseFloat(watts) / base.weight).toFixed(2) : null;
  const socialLinks = ap.social_links || {};
  const personalFacts = ap.personal_facts || [];
  const isOwnProfile = currentUser?.id === base.id;

  const handleC2Connect = async () => {
    if (!currentUser) return;
    setC2Connecting(true);
    try {
      const res = await c2Connect({ user_id: currentUser.id });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Connection error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection failed", variant: "destructive" });
    } finally {
      setC2Connecting(false);
    }
  };

  const handleC2Sync = async () => {
    if (!currentUser) return;
    setC2Syncing(true);
    try {
      const res = await c2Sync({ user_id: currentUser.id });
      const data = await res.json();
      if (data.success) {
        setC2LastSync(new Date().toISOString());
        setC2ImportedCount(data.imported);
        queryClient.invalidateQueries({ queryKey: ["public-athlete", username] });
        toast({ title: `Synced! ${data.imported} workout${data.imported === 1 ? "" : "s"} imported.` });
      } else {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setC2Syncing(false);
    }
  };

  const handleC2Disconnect = async () => {
    if (!currentUser) return;
    try {
      await c2Disconnect({ user_id: currentUser.id });
      setC2Connected(false);
      setC2LastSync(null);
      setC2ImportedCount(null);
      toast({ title: "Concept2 disconnected" });
    } catch {
      toast({ title: "Disconnect failed", variant: "destructive" });
    }
  };

  const handleWhoopConnect = async () => {
    if (!currentUser) return;
    setWhoopConnecting(true);
    try {
      const res = await whoopConnect({ user_id: currentUser.id });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Connection error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection failed", variant: "destructive" });
    } finally {
      setWhoopConnecting(false);
    }
  };

  const handleWhoopSync = async () => {
    if (!currentUser) return;
    setWhoopSyncing(true);
    try {
      const res = await whoopSync({ user_id: currentUser.id });
      const data = await res.json();
      if (data.success) {
        setWhoopLastSync(new Date().toISOString());
        queryClient.invalidateQueries({ queryKey: ["whoop-section", base?.id] });
        toast({ title: "Whoop synced!" });
      } else {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setWhoopSyncing(false);
    }
  };

  const handleWhoopDisconnect = async () => {
    if (!currentUser) return;
    try {
      await whoopDisconnect({ user_id: currentUser.id });
      setWhoopConnected(false);
      setWhoopLastSync(null);
      queryClient.invalidateQueries({ queryKey: ["whoop-section", base?.id] });
      toast({ title: "Whoop disconnected" });
    } catch {
      toast({ title: "Disconnect failed", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={crewsyncLogo} alt="CrewSync" className="h-8 w-8 rounded-lg cursor-pointer" onClick={() => navigate("/")} />
            <span className="font-semibold text-sm text-muted-foreground">CrewSync</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={copyLink}><Link2 className="h-4 w-4 mr-1" />Share</Button>
            {!currentUser && (
              <Button size="sm" onClick={() => navigate("/auth")}>Sign In</Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Hero Card */}
        <Card className="overflow-hidden">
          {/* Banner */}
          <div className="h-24 bg-gradient-to-r from-primary/80 to-primary/40" />
          <CardContent className="pt-0 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12">
              <div className="flex items-end gap-4">
                <Avatar className="h-24 w-24 border-4 border-white dark:border-slate-900 shadow-lg">
                  <AvatarImage src={ap.avatar_url} />
                  <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
                    {base.full_name?.charAt(0) || base.username?.charAt(0) || "A"}
                  </AvatarFallback>
                </Avatar>
                <div className="mb-1">
                  <h1 className="text-2xl font-bold">{base.full_name || base.username}</h1>
                  <p className="text-muted-foreground text-sm">@{base.username}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {ap.is_recruiting && (
                  <Badge className="bg-green-500 text-white"><GraduationCap className="h-3 w-3 mr-1" />Actively Recruiting</Badge>
                )}
                {ap.grad_year && <Badge variant="outline">Class of {ap.grad_year}</Badge>}
                {!isOwnProfile && (
                  <Button
                    size="sm"
                    variant={isFollowing ? "outline" : "default"}
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending}
                  >
                    {isFollowing ? <><UserCheck className="h-4 w-4 mr-1" />Following</> : <><UserPlus className="h-4 w-4 mr-1" />Follow</>}
                  </Button>
                )}
                {isOwnProfile && (
                  <Button size="sm" variant="outline" onClick={() => navigate("/")}>Edit Profile</Button>
                )}
              </div>
            </div>

            {/* Meta info */}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              {ap.school && <span className="flex items-center gap-1"><School className="h-4 w-4" />{ap.school}</span>}
              {ap.club_team && <span className="flex items-center gap-1"><Users className="h-4 w-4" />{ap.club_team}</span>}
              {ap.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{ap.location}</span>}
              <span className="flex items-center gap-1"><Eye className="h-4 w-4" />{ap.view_count || 0} views</span>
              <span className="flex items-center gap-1"><Heart className="h-4 w-4" />{followers} followers</span>
            </div>

            {/* Social links */}
            {(socialLinks.instagram || socialLinks.twitter || socialLinks.youtube || socialLinks.website) && (
              <div className="mt-3 flex gap-3">
                {socialLinks.instagram && (
                  <a href={`https://instagram.com/${socialLinks.instagram}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Instagram className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.twitter && (
                  <a href={`https://twitter.com/${socialLinks.twitter}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Twitter className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.youtube && (
                  <a href={socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Youtube className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.website && (
                  <a href={socialLinks.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Globe className="h-5 w-5" />
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="md:col-span-2 space-y-6">
            {/* AI Summary */}
            {ap.ai_summary && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-500" />Athlete Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-foreground/90 italic">"{ap.ai_summary}"</p>
                </CardContent>
              </Card>
            )}

            {/* Bio / Personal Statement */}
            {(ap.bio || ap.personal_statement) && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">About</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {ap.bio && <p className="text-sm text-muted-foreground">{ap.bio}</p>}
                  {ap.personal_statement && (
                    <>
                      {ap.bio && <Separator />}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Personal Statement</p>
                        <p className="text-sm leading-relaxed">{ap.personal_statement}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Erg Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold text-primary">{fmtSplit(bestErg?.avg_split)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Best Split</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold">{watts ? `${watts}W` : "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">Peak Watts</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold">{wkg ? `${wkg}` : "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">W/kg</div>
                  </div>
                  <div className="text-center p-3 bg-muted/50 rounded-lg">
                    <div className="text-xl font-bold">{totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(0)}k` : totalVolume || "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">Monthly m</div>
                  </div>
                </div>
                {combine && (
                  <div className="mt-3 p-3 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg border border-primary/20 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CrewSync Combine Score</p>
                      <p className="text-2xl font-bold text-primary">{combine.combine_score?.toFixed(1) || "—"}</p>
                    </div>
                    {combine.two_k_seconds && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">2k: {Math.floor(combine.two_k_seconds/60)}:{String(combine.two_k_seconds%60).padStart(2,"0")}</p>
                        {combine.two_k_watts && <p className="text-xs text-muted-foreground">{combine.two_k_watts}W</p>}
                      </div>
                    )}
                  </div>
                )}

                {ergs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Results</p>
                    {ergs.map((w: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                        <span className="text-muted-foreground">{w.workout_date} · {w.distance}m</span>
                        <span className="font-medium">{fmtSplit(w.avg_split)}/500m</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Calendar Heatmap */}
            <Card className="bg-gradient-to-br from-[#0a1628] to-[#112240] border-white/10">
              <CardContent className="p-5">
                <CalendarHeatmap userId={base.id} />
              </CardContent>
            </Card>

            {/* PR Wall Link */}
            <Card className="border-[#f59e0b]/30 bg-gradient-to-r from-[#f59e0b]/5 to-transparent cursor-pointer hover:border-[#f59e0b]/50 transition-colors"
              onClick={() => navigate(`/athlete/${username}/prs`)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Trophy className="h-6 w-6 text-[#f59e0b]" />
                  <div>
                    <p className="font-semibold text-foreground">Personal Records</p>
                    <p className="text-xs text-muted-foreground">View all-time PRs</p>
                  </div>
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>

            {/* Whoop Data Display */}
            <WhoopSection userId={base.id} />

            {/* Recruiting Info */}
            {ap.is_recruiting && (
              <Card className="border-green-200 dark:border-green-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
                    <GraduationCap className="h-4 w-4" />Recruiting Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {ap.division_interest && (
                      <div>
                        <p className="text-xs text-muted-foreground">Division Interest</p>
                        <p className="font-semibold">{ap.division_interest}</p>
                      </div>
                    )}
                    {(academics?.intended_major || ap.intended_major) && (
                      <div>
                        <p className="text-xs text-muted-foreground">Intended Major</p>
                        <p className="font-semibold">{academics?.intended_major || ap.intended_major}</p>
                      </div>
                    )}
                    {(academics?.gpa || ap.gpa) && (
                      <div>
                        <p className="text-xs text-muted-foreground">GPA</p>
                        <p className="font-semibold">
                          {academics?.gpa ? `${Number(academics.gpa).toFixed(2)}${academics.gpa_weighted ? " (W)" : ""}` : ap.gpa}
                        </p>
                      </div>
                    )}
                    {academics?.sat_score && (
                      <div>
                        <p className="text-xs text-muted-foreground">SAT</p>
                        <p className="font-semibold">{academics.sat_score} / 1600</p>
                      </div>
                    )}
                    {academics?.act_score && (
                      <div>
                        <p className="text-xs text-muted-foreground">ACT</p>
                        <p className="font-semibold">{academics.act_score} / 36</p>
                      </div>
                    )}
                    {academics?.psat_score && (
                      <div>
                        <p className="text-xs text-muted-foreground">PSAT</p>
                        <p className="font-semibold">{academics.psat_score} / 1520</p>
                      </div>
                    )}
                    {academics?.class_rank_numerator && academics?.class_rank_denominator && (
                      <div>
                        <p className="text-xs text-muted-foreground">Class Rank</p>
                        <p className="font-semibold">{academics.class_rank_numerator} of {academics.class_rank_denominator}</p>
                      </div>
                    )}
                    {ap.contact_email && (
                      <div>
                        <p className="text-xs text-muted-foreground">Contact</p>
                        <a href={`mailto:${ap.contact_email}`} className="font-semibold text-primary flex items-center gap-1">
                          <Mail className="h-3 w-3" />{ap.contact_email}
                        </a>
                      </div>
                    )}
                  </div>
                  {academics?.academic_interests && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Academic Interests</p>
                      <p className="text-sm">{academics.academic_interests}</p>
                    </div>
                  )}
                  {ap.highlight_video_url && (
                    <a
                      href={ap.highlight_video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Youtube className="h-4 w-4" />Watch Highlight Video <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Physical Stats */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Athlete Info</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {base.height && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Height</span>
                    <span className="font-medium">{cmToDisplay(base.height)}</span>
                  </div>
                )}
                {base.weight && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Weight</span>
                    <span className="font-medium">{kgToLbs(base.weight)}</span>
                  </div>
                )}
                {ap.grad_year && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Grad Year</span>
                    <span className="font-medium">{ap.grad_year}</span>
                  </div>
                )}
                {strengthCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Strength Sessions</span>
                    <span className="font-medium flex items-center gap-1"><Dumbbell className="h-3 w-3" />{strengthCount}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Personal Facts */}
            {personalFacts.length > 0 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Facts</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {personalFacts.map((fact: any, i: number) => (
                    <div key={i} className="text-sm">
                      <p className="text-xs text-muted-foreground">{fact.label}</p>
                      <p className="font-medium">{fact.value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Concept2 Integration — only shown to profile owner */}
            {isOwnProfile && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <img src="/c2logo.png" alt="Concept2" style={{ height: 20, width: "auto" }} />
                    Concept2 Logbook
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {c2Connected ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                          Connected
                        </span>
                        <img src="/c2logo.png" alt="Concept2" style={{ height: 14, width: "auto", opacity: 0.7 }} />
                      </div>
                      {c2ImportedCount !== null && (
                        <p className="text-xs text-muted-foreground">
                          {c2ImportedCount} workout{c2ImportedCount === 1 ? "" : "s"} imported
                        </p>
                      )}
                      {c2LastSync && (
                        <p className="text-xs text-muted-foreground">
                          Last synced: {new Date(c2LastSync).toLocaleDateString()}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={handleC2Sync}
                          disabled={c2Syncing}
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${c2Syncing ? "animate-spin" : ""}`} />
                          {c2Syncing ? "Syncing…" : "Sync Now"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-muted-foreground hover:text-destructive"
                          onClick={handleC2Disconnect}
                        >
                          <Unplug className="h-3 w-3 mr-1" />
                          Disconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Connect your Concept2 account to automatically import workouts.
                      </p>
                      <Button
                        size="sm"
                        className="w-full text-xs"
                        onClick={handleC2Connect}
                        disabled={c2Connecting}
                      >
                        {c2Connecting ? "Connecting…" : <><img src="/c2logo.png" alt="" style={{ height: 14, width: "auto" }} className="mr-1.5" />Connect Concept2 Account</>}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Whoop Integration — only shown to profile owner */}
            {isOwnProfile && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <img src="/whooplogo.png" alt="Whoop" style={{ height: 20, width: "auto" }} />
                    Whoop
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {whoopConnected ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                          Connected
                        </span>
                        <img src="/whooplogo.png" alt="Whoop" style={{ height: 14, width: "auto", opacity: 0.7 }} />
                      </div>
                      {whoopLastSync && (
                        <p className="text-xs text-muted-foreground">
                          Last synced: {new Date(whoopLastSync).toLocaleDateString()}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={handleWhoopSync}
                          disabled={whoopSyncing}
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${whoopSyncing ? "animate-spin" : ""}`} />
                          {whoopSyncing ? "Syncing…" : "Sync Now"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-muted-foreground hover:text-destructive"
                          onClick={handleWhoopDisconnect}
                        >
                          <Unplug className="h-3 w-3 mr-1" />
                          Disconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Connect Whoop to sync recovery, HRV, sleep, and strain data.
                      </p>
                      <Button
                        size="sm"
                        className="w-full text-xs"
                        onClick={handleWhoopConnect}
                        disabled={whoopConnecting}
                      >
                        {whoopConnecting ? "Connecting…" : <><img src="/whooplogo.png" alt="" style={{ height: 14, width: "auto" }} className="mr-1.5" />Connect Whoop</>}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* CTA for coaches */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4 text-center space-y-2">
                <TrendingUp className="h-8 w-8 text-primary mx-auto" />
                <p className="text-sm font-medium">Track this athlete</p>
                <p className="text-xs text-muted-foreground">Follow to get notified when they update their profile.</p>
                {!currentUser ? (
                  <Button size="sm" className="w-full" onClick={() => navigate("/auth")}>Create Free Account</Button>
                ) : (
                  <Button size="sm" className="w-full" variant={isFollowing ? "outline" : "default"} onClick={() => followMutation.mutate()}>
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="text-center py-8 text-xs text-muted-foreground">
        <p>Powered by <a href="/" className="text-primary hover:underline">CrewSync</a> · The Rowing Training Platform</p>
      </footer>
    </div>
  );
}
