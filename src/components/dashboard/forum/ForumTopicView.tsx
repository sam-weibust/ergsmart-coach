import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Clock, Trash2, Edit2, Send, ImagePlus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

interface Props {
  topicId: string;
  topicTitle: string;
  onBack: () => void;
}

const ForumTopicView = ({ topicId, topicTitle, onBack }: Props) => {
  const [reply, setReply] = useState("");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyImages, setReplyImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: topic } = useQuery({
    queryKey: ["forum-topic", topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_topics")
        .select("*, author:profiles!forum_topics_author_id_fkey(username, full_name)")
        .eq("id", topicId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ["forum-posts", topicId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_posts")
        .select("*, author:profiles!forum_posts_author_id_fkey(username, full_name)")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addReply = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error("Not authenticated");
      const trimmed = reply.trim();
      if (!trimmed) throw new Error("Reply cannot be empty");
      if (trimmed.length > 10000) throw new Error("Reply too long");

      const { error } = await supabase.from("forum_posts").insert({
        topic_id: topicId,
        author_id: currentUser.id,
        content: trimmed,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reply posted!");
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["forum-posts", topicId] });
      queryClient.invalidateQueries({ queryKey: ["forum-topic", topicId] });
      queryClient.invalidateQueries({ queryKey: ["forum-topics"] });
      queryClient.invalidateQueries({ queryKey: ["forum-categories"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deletePost = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("forum_posts").delete().eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post deleted");
      queryClient.invalidateQueries({ queryKey: ["forum-posts", topicId] });
      queryClient.invalidateQueries({ queryKey: ["forum-topics"] });
      queryClient.invalidateQueries({ queryKey: ["forum-categories"] });
    },
    onError: () => toast.error("Failed to delete post"),
  });

  const updatePost = useMutation({
    mutationFn: async (postId: string) => {
      const trimmed = editContent.trim();
      if (!trimmed) throw new Error("Content cannot be empty");
      const { error } = await supabase
        .from("forum_posts")
        .update({ content: trimmed, is_edited: true })
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Post updated");
      setEditingPostId(null);
      setEditContent("");
      queryClient.invalidateQueries({ queryKey: ["forum-posts", topicId] });
    },
    onError: () => toast.error("Failed to update post"),
  });

  const deleteTopic = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("forum_topics").delete().eq("id", topicId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Topic deleted");
      onBack();
      queryClient.invalidateQueries({ queryKey: ["forum-topics"] });
      queryClient.invalidateQueries({ queryKey: ["forum-categories"] });
    },
    onError: () => toast.error("Failed to delete topic"),
  });

  const getInitials = (author: any) => {
    const name = author?.full_name || author?.username || "?";
    return name.slice(0, 2).toUpperCase();
  };

  const getDisplayName = (author: any) => {
    return author?.username || author?.full_name || "Unknown";
  };

  const isLocked = topic?.is_locked;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-bold text-foreground flex-1 truncate">{topicTitle}</h2>
        {currentUser?.id === topic?.author_id && (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => {
              if (confirm("Delete this topic and all its replies?")) deleteTopic.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Original post */}
      {topic && (
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {getInitials(topic.author)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">
                    {getDisplayName(topic.author)}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(topic.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="mt-2 text-foreground whitespace-pre-wrap break-words">
                  {topic.content}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Replies */}
      {postsLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : posts?.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-4">No replies yet. Be the first to respond!</p>
      ) : (
        <div className="space-y-3">
          {posts?.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
                      {getInitials(post.author)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">
                        {getDisplayName(post.author)}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </span>
                      {post.is_edited && (
                        <span className="text-xs text-muted-foreground italic">(edited)</span>
                      )}
                    </div>
                    {editingPostId === post.id ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                          maxLength={10000}
                        />
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => setEditingPostId(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => updatePost.mutate(post.id)}
                            disabled={!editContent.trim() || updatePost.isPending}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 text-sm text-foreground whitespace-pre-wrap break-words">
                        {post.content}
                      </div>
                    )}
                  </div>
                  {currentUser?.id === post.author_id && editingPostId !== post.id && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingPostId(post.id);
                          setEditContent(post.content);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm("Delete this reply?")) deletePost.mutate(post.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Reply form */}
      {!isLocked && (
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Textarea
                placeholder="Write a reply..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                maxLength={10000}
                className="flex-1"
              />
              <Button
                size="icon"
                onClick={() => addReply.mutate()}
                disabled={!reply.trim() || addReply.isPending}
                className="shrink-0 self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ForumTopicView;
