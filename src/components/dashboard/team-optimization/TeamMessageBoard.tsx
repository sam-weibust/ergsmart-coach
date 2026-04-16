import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Loader2, Pin, Trash2, Reply, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

const CATEGORY_COLORS: Record<string, string> = {
  announcement: "bg-primary text-primary-foreground",
  lineup: "bg-blue-100 text-blue-800",
  general: "bg-muted text-muted-foreground",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TeamMessageBoard = ({ teamId, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["team-board-posts", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_board_posts")
        .select("*, author:profiles!team_board_posts_author_id_fkey(id, full_name, username)")
        .eq("team_id", teamId)
        .is("parent_id", null)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allReplies = [] } = useQuery({
    queryKey: ["team-board-replies", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_board_posts")
        .select("*, author:profiles!team_board_posts_author_id_fkey(id, full_name, username)")
        .eq("team_id", teamId)
        .not("parent_id", "is", null)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`board-${teamId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "team_board_posts",
        filter: `team_id=eq.${teamId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-board-posts", teamId] });
        queryClient.invalidateQueries({ queryKey: ["team-board-replies", teamId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamId, queryClient]);

  const postMessage = useMutation({
    mutationFn: async ({ content, category, parentId }: { content: string; category: string; parentId?: string }) => {
      const { error } = await supabase.from("team_board_posts").insert({
        team_id: teamId,
        author_id: profile.id,
        content,
        category,
        parent_id: parentId || null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      if (vars.parentId) {
        setReplyContent("");
        setReplyingTo(null);
      } else {
        setNewContent("");
        setNewCategory("general");
      }
      queryClient.invalidateQueries({ queryKey: ["team-board-posts", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-board-replies", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pinPost = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase.from("team_board_posts").update({ is_pinned: !pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-board-posts", teamId] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_board_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-board-posts", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team-board-replies", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function toggleExpand(postId: string) {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  }

  const getReplies = (postId: string) => allReplies.filter((r: any) => r.parent_id === postId);

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Team Message Board</h2>
        <p className="text-sm text-muted-foreground">Announcements, lineup updates, and team discussion</p>
      </div>

      {/* New post form */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-3">
            <Textarea
              placeholder="Write a message to your team..."
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex items-center gap-2">
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="announcement">Announcement</SelectItem>
                  <SelectItem value="lineup">Lineup</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="gap-1 ml-auto"
                onClick={() => postMessage.mutate({ content: newContent, category: newCategory })}
                disabled={!newContent.trim() || postMessage.isPending}
              >
                {postMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Posts */}
      {posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No posts yet. Be the first to post!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post: any) => {
            const author = post.author;
            const replies = getReplies(post.id);
            const isExpanded = expandedPosts.has(post.id);
            const canDelete = isCoach || post.author_id === profile.id;

            return (
              <Card key={post.id} className={cn(post.is_pinned ? "border-primary/50 bg-primary/5" : "")}>
                <CardContent className="pt-4 pb-3">
                  {/* Post header */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {post.is_pinned && <Pin className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span className="text-sm font-semibold">{author?.full_name || author?.username || "Unknown"}</span>
                        <Badge className={cn("text-xs", CATEGORY_COLORS[post.category] || CATEGORY_COLORS.general)}>
                          {post.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
                        {post.is_edited && <span className="text-xs text-muted-foreground italic">(edited)</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isCoach && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={post.is_pinned ? "Unpin" : "Pin"} onClick={() => pinPost.mutate({ id: post.id, pinned: post.is_pinned })}>
                          <Pin className={cn("h-3.5 w-3.5", post.is_pinned ? "text-primary fill-primary" : "text-muted-foreground")} />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deletePost.mutate(post.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <p className="text-sm whitespace-pre-wrap">{post.content}</p>

                  {/* Replies section */}
                  <div className="mt-3 space-y-2">
                    {replies.length > 0 && (
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => toggleExpand(post.id)}
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {replies.length} {replies.length === 1 ? "reply" : "replies"}
                      </button>
                    )}

                    {isExpanded && replies.length > 0 && (
                      <div className="pl-4 border-l-2 border-muted space-y-2 mt-2">
                        {replies.map((reply: any) => {
                          const replyAuthor = reply.author;
                          const canDeleteReply = isCoach || reply.author_id === profile.id;
                          return (
                            <div key={reply.id} className="flex items-start gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold">{replyAuthor?.full_name || replyAuthor?.username || "Unknown"}</span>
                                  <span className="text-xs text-muted-foreground">{timeAgo(reply.created_at)}</span>
                                </div>
                                <p className="text-sm mt-0.5 whitespace-pre-wrap">{reply.content}</p>
                              </div>
                              {canDeleteReply && (
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={() => deletePost.mutate(reply.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Reply input */}
                    {replyingTo === post.id ? (
                      <div className="flex gap-2 mt-2">
                        <Textarea
                          placeholder="Write a reply..."
                          value={replyContent}
                          onChange={e => setReplyContent(e.target.value)}
                          rows={2}
                          className="resize-none text-sm"
                        />
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            onClick={() => postMessage.mutate({ content: replyContent, category: "general", parentId: post.id })}
                            disabled={!replyContent.trim() || postMessage.isPending}
                          >
                            Reply
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyContent(""); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                        onClick={() => { setReplyingTo(post.id); setExpandedPosts(prev => new Set([...prev, post.id])); }}
                      >
                        <Reply className="h-3.5 w-3.5" />Reply
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamMessageBoard;
