import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, MessageSquare, Pin, Lock, Clock, ImagePlus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Props {
  categoryId: string;
  categoryName: string;
  onBack: () => void;
  onSelectTopic: (id: string, title: string) => void;
}

const ForumTopicList = ({ categoryId, categoryName, onBack, onSelectTopic }: Props) => {
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const queryClient = useQueryClient();

  const { data: topics, isLoading } = useQuery({
    queryKey: ["forum-topics", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_topics")
        .select("*, author:profiles!forum_topics_author_id_fkey(username, full_name), last_post_author:profiles!forum_topics_last_post_author_id_fkey(username, full_name)")
        .eq("category_id", categoryId)
        .order("is_pinned", { ascending: false })
        .order("last_post_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createTopic = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const trimmedTitle = newTitle.trim();
      const trimmedContent = newContent.trim();
      if (!trimmedTitle || !trimmedContent) throw new Error("Title and content are required");
      if (trimmedTitle.length > 200) throw new Error("Title too long");
      if (trimmedContent.length > 10000) throw new Error("Content too long");

      const { error } = await supabase.from("forum_topics").insert({
        category_id: categoryId,
        title: trimmedTitle,
        content: trimmedContent,
        author_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Topic created!");
      setNewTitle("");
      setNewContent("");
      setShowNewTopic(false);
      queryClient.invalidateQueries({ queryKey: ["forum-topics", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["forum-categories"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">{categoryName}</h2>
        </div>
        <Button onClick={() => setShowNewTopic(!showNewTopic)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Topic
        </Button>
      </div>

      {showNewTopic && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="Topic title..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={200}
            />
            <Textarea
              placeholder="Write your topic content..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              maxLength={10000}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowNewTopic(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => createTopic.mutate()}
                disabled={!newTitle.trim() || !newContent.trim() || createTopic.isPending}
              >
                {createTopic.isPending ? "Posting..." : "Create Topic"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : topics?.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No topics yet</p>
            <p className="text-sm">Be the first to start a discussion!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {topics?.map((topic) => (
            <Card
              key={topic.id}
              className="cursor-pointer hover:border-primary/50 transition-all group"
              onClick={() => onSelectTopic(topic.id, topic.title)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {topic.is_pinned && <Pin className="h-3.5 w-3.5 text-primary shrink-0" />}
                    {topic.is_locked && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <h3 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                      {topic.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>by {(topic.author as any)?.username || (topic.author as any)?.full_name || "Unknown"}</span>
                    <span>·</span>
                    <Clock className="h-3 w-3" />
                    <span>{formatDistanceToNow(new Date(topic.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{topic.reply_count || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ForumTopicList;
