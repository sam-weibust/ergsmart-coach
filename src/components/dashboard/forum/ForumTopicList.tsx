import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, MessageSquare, Pin, Lock, Clock, ImagePlus, X, ThumbsUp, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { getSessionUser } from '@/lib/getUser';

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
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const user = await getSessionUser();
      return user;
    },
  });

  const { data: topics, isLoading } = useQuery({
    queryKey: ["forum-topics", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_topics")
        .select("*, author:profiles!forum_topics_author_id_fkey(username, full_name, user_type), last_post_author:profiles!forum_topics_last_post_author_id_fkey(username, full_name)")
        .eq("category_id", categoryId)
        .order("is_pinned", { ascending: false })
        .order("last_post_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: myTopicVotes } = useQuery({
    queryKey: ["my-topic-votes", categoryId],
    queryFn: async () => {
      if (!currentUser) return new Set<string>();
      const { data } = await (supabase as any)
        .from("forum_votes")
        .select("topic_id")
        .eq("user_id", currentUser.id)
        .not("topic_id", "is", null);
      return new Set<string>((data || []).map((v: any) => v.topic_id));
    },
    enabled: !!currentUser,
  });

  const voteTopic = useMutation({
    mutationFn: async ({ topicId, hasVoted }: { topicId: string; hasVoted: boolean }) => {
      if (!currentUser) throw new Error("Not authenticated");
      if (hasVoted) {
        await (supabase as any).from("forum_votes").delete().eq("user_id", currentUser.id).eq("topic_id", topicId);
      } else {
        await (supabase as any).from("forum_votes").insert({ user_id: currentUser.id, topic_id: topicId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forum-topics", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["my-topic-votes", categoryId] });
    },
    onError: () => toast.error("Failed to vote"),
  });

  const createTopic = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
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

      // If there are uploaded images, add them to the first post
      if (uploadedImages.length > 0) {
        const { data: topic } = await supabase
          .from("forum_topics")
          .select("id")
          .eq("category_id", categoryId)
          .eq("title", trimmedTitle)
          .eq("author_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (topic) {
          await supabase.from("forum_posts").insert({
            topic_id: topic.id,
            author_id: user.id,
            content: "Images shared with this topic:",
            images: uploadedImages,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Topic created!");
      setNewTitle("");
      setNewContent("");
      setUploadedImages([]);
      setShowNewTopic(false);
      queryClient.invalidateQueries({ queryKey: ["forum-topics", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["forum-categories"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const user = await getSessionUser();
    if (!user) return;

    setIsUploading(true);
    const newImageUrls: string[] = [];

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image file`);
          continue;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
          toast.error(`${file.name} is too large (max 5MB)`);
          continue;
        }

        const fileExt = file.name.split('.').pop()?.toLowerCase();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('forum-images')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('forum-images')
          .getPublicUrl(data.path);

        newImageUrls.push(publicUrl);
      }

      setUploadedImages(prev => [...prev, ...newImageUrls]);
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

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
            
            {/* Image Upload */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label htmlFor="image-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-md hover:bg-accent/50 transition-colors">
                    <ImagePlus className="h-4 w-4" />
                    <span>{isUploading ? "Uploading..." : "Add Images"}</span>
                  </div>
                </label>
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isUploading}
                />
                <span className="text-xs text-muted-foreground">Max 5MB per image</span>
              </div>

              {/* Preview uploaded images */}
              {uploadedImages.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {uploadedImages.map((url, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={url}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-20 object-cover rounded-md border"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowNewTopic(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => createTopic.mutate()}
                disabled={!newTitle.trim() || !newContent.trim() || createTopic.isPending || isUploading}
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
                    {(topic.author as any)?.user_type === "coach" && (
                      <Badge variant="outline" className="text-[10px] h-4 py-0 gap-0.5 border-primary text-primary">
                        <ShieldCheck className="h-2.5 w-2.5" />Coach
                      </Badge>
                    )}
                    <span>·</span>
                    <Clock className="h-3 w-3" />
                    <span>{formatDistanceToNow(new Date(topic.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className={`flex items-center gap-1 text-xs ${myTopicVotes?.has(topic.id) ? "text-primary" : "text-muted-foreground"} hover:text-primary transition-colors`}
                    onClick={(e) => { e.stopPropagation(); voteTopic.mutate({ topicId: topic.id, hasVoted: !!myTopicVotes?.has(topic.id) }); }}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    <span>{(topic as any).upvote_count || 0}</span>
                  </button>
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
