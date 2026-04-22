import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageCircle, Users, Flame, Trophy, ChevronRight,
  PenSquare, X, Loader2, Medal, PartyPopper,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { getSessionUser } from '@/lib/getUser';

interface Props {
  navTo: (section: string, sub?: string) => void;
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "--";
  // Already formatted like "7:24" or "7:24.5"
  return t;
}

export function DashboardCommunityFeed({ navTo }: Props) {
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  // Recent forum topics (live feed)
  const { data: recentTopics = [] } = useQuery({
    queryKey: ["dashboard-forum-feed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("forum_topics")
        .select(
          "id, title, reply_count, last_post_at, created_at, author:profiles!forum_topics_author_id_fkey(username, full_name), category:forum_categories!forum_topics_category_id_fkey(id, name, color)"
        )
        .order("last_post_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  // Realtime: new topics or posts → refresh feed
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-community-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "forum_topics" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-forum-feed"] })
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "forum_posts" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-forum-feed"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Community quick stats
  const { data: stats } = useQuery({
    queryKey: ["dashboard-community-stats"],
    queryFn: async () => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);

      const [membersRes, postsRes, catRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("forum_topics")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekStart.toISOString()),
        supabase
          .from("forum_categories")
          .select("name, topic_count")
          .order("topic_count", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        members: membersRes.count ?? 0,
        postsThisWeek: postsRes.count ?? 0,
        topCategory: catRes.data?.name ?? null,
      };
    },
  });

  // Top 3 global 2K leaderboard
  const { data: topLeaders = [] } = useQuery({
    queryKey: ["dashboard-leaderboard-top3"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("verified_times")
        .select("id, user_id, time_achieved, profiles!verified_times_user_id_fkey(full_name, username)")
        .eq("distance", "2K")
        .eq("verification_status", "verified")
        .order("time_achieved", { ascending: true })
        .limit(3);
      return data || [];
    },
  });

  // Most recently joined member
  const { data: newestMember } = useQuery({
    queryKey: ["dashboard-newest-member"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Categories for compose
  const { data: categories = [] } = useQuery({
    queryKey: ["forum-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("forum_categories")
        .select("id, name, color")
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: composing,
  });

  const submitPost = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const title = newTitle.trim();
      const content = newContent.trim();
      if (!title || !content) throw new Error("Title and content required");
      if (!selectedCatId) throw new Error("Select a category");
      const { error } = await supabase.from("forum_topics").insert({
        category_id: selectedCatId,
        title,
        content,
        author_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post created!");
      setComposing(false);
      setNewTitle("");
      setNewContent("");
      setSelectedCatId("");
      queryClient.invalidateQueries({ queryKey: ["dashboard-forum-feed"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-community-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rankLabel = (i: number) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 rounded-full bg-[#2d6be4]" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Community</h2>
        </div>
        <button
          onClick={() => navTo("community", "forum")}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          View All Discussions <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Quick stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-center">
            <p className="text-base font-bold text-foreground">{stats.members.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              <Users className="h-2.5 w-2.5" /> Members
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-center">
            <p className="text-base font-bold text-foreground">{stats.postsThisWeek}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              <Flame className="h-2.5 w-2.5 text-orange-400" /> Posts this week
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-center">
            <p className="text-[11px] font-bold text-foreground truncate">{stats.topCategory ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              <Trophy className="h-2.5 w-2.5 text-amber-500" /> Top category
            </p>
          </div>
        </div>
      )}

      {/* Newest member celebration */}
      {newestMember && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/10">
          <PartyPopper className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs text-foreground">
            Welcome{" "}
            <span className="font-semibold">
              {newestMember.full_name || newestMember.username || "a new rower"}
            </span>{" "}
            — glad you're here!
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live forum feed */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                Recent Discussions
              </h3>
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5 px-3"
                onClick={() => setComposing((v) => !v)}
              >
                {composing ? <X className="h-3 w-3" /> : <PenSquare className="h-3 w-3" />}
                {composing ? "Cancel" : "Write a Post"}
              </Button>
            </div>

            {/* Inline compose panel */}
            {composing && (
              <div className="mx-4 mb-3 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                <select
                  className="w-full text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                >
                  <option value="">Select category…</option>
                  {(categories as any[]).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Input
                  placeholder="Topic title…"
                  className="h-8 text-xs"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={200}
                />
                <Textarea
                  placeholder="What's on your mind?"
                  className="text-xs min-h-[72px] resize-none"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  maxLength={5000}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="h-7 text-xs px-4"
                    disabled={!newTitle.trim() || !newContent.trim() || !selectedCatId || submitPost.isPending}
                    onClick={() => submitPost.mutate()}
                  >
                    {submitPost.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Post"}
                  </Button>
                </div>
              </div>
            )}

            {/* Topic list */}
            <div className="divide-y divide-border">
              {recentTopics.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No discussions yet — be the first to post!
                </div>
              ) : (
                (recentTopics as any[]).map((topic: any) => {
                  const cat = topic.category as any;
                  const author = topic.author as any;
                  return (
                    <button
                      key={topic.id}
                      onClick={() => navTo("community", "forum")}
                      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
                    >
                      <div
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: cat?.color || "#3b82f6" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{topic.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">
                            {author?.username || author?.full_name || "Unknown"}
                          </span>
                          {cat?.name && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-3.5 px-1 py-0 border-0 font-medium"
                              style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                            >
                              {cat.name}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            · {topic.reply_count || 0} replies
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            · {topic.last_post_at
                              ? formatDistanceToNow(new Date(topic.last_post_at), { addSuffix: true })
                              : formatDistanceToNow(new Date(topic.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border">
              <button
                onClick={() => navTo("community", "forum")}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View All Discussions <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard top 3 */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Medal className="h-4 w-4 text-amber-500" />
                Global 2K Leaders
              </h3>
              <button
                onClick={() => navTo("competition", "leaderboard")}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Full board <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {topLeaders.length === 0 ? (
              <div className="text-center py-6">
                <Trophy className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No verified times yet</p>
                <button
                  onClick={() => navTo("competition", "leaderboard")}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  Submit your 2K →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {(topLeaders as any[]).map((entry: any, i: number) => {
                  const p = entry.profiles as any;
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 py-2 px-3 rounded-xl ${
                        i === 0
                          ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40"
                          : i === 1
                          ? "bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/40"
                          : "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40"
                      }`}
                    >
                      <span className="text-base shrink-0">{rankLabel(i)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {p?.full_name || p?.username || "Athlete"}
                        </p>
                      </div>
                      <span className="text-sm font-mono font-bold text-foreground shrink-0">
                        {formatTime(entry.time_achieved)}
                      </span>
                    </div>
                  );
                })}
                <button
                  onClick={() => navTo("competition", "leaderboard")}
                  className="w-full text-xs text-primary hover:underline text-center pt-1"
                >
                  See full leaderboard →
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
