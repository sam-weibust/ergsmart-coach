import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Zap, Settings, Apple, Users, Trophy, ArrowRight, Flame, ThumbsUp, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const iconMap: Record<string, React.ElementType> = {
  MessageCircle,
  Zap,
  Settings,
  Apple,
  Users,
  Trophy,
};

interface Props {
  onSelectCategory: (id: string, name: string) => void;
}

const ForumCategoryList = ({ onSelectCategory }: Props) => {
  const { data: categories, isLoading } = useQuery({
    queryKey: ["forum-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forum_categories")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: hotTopics } = useQuery({
    queryKey: ["forum-hot-topics"],
    queryFn: async () => {
      const { data } = await supabase
        .from("forum_topics")
        .select("id, title, reply_count, last_post_at, category_id, author:profiles!forum_topics_author_id_fkey(username, full_name, user_type), category:forum_categories!forum_topics_category_id_fkey(id, name, color)")
        .order("last_post_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <MessageCircle className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Community Forum</h2>
      </div>
      <p className="text-muted-foreground">
        Connect with fellow rowers, share tips, and discuss everything rowing.
      </p>

      {/* Active Discussions */}
      {hotTopics && hotTopics.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Active Discussions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {hotTopics.map((topic: any) => (
                <div
                  key={topic.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onSelectCategory((topic as any).category?.id || (topic as any).category_id || "", (topic as any).category?.name || "")}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: topic.category?.color || "#3b82f6" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{topic.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{(topic.author as any)?.username || "Unknown"}</span>
                      {(topic.author as any)?.user_type === "coach" && (
                        <Badge variant="outline" className="text-[10px] h-4 py-0 gap-0.5 border-primary text-primary">
                          <ShieldCheck className="h-2.5 w-2.5" />Coach
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <MessageCircle className="h-3 w-3" />
                    {topic.reply_count || 0}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {categories?.map((cat) => {
          const Icon = iconMap[cat.icon || "MessageCircle"] || MessageCircle;
          return (
            <Card
              key={cat.id}
              className="cursor-pointer hover:border-primary/50 transition-all group"
              onClick={() => onSelectCategory(cat.id, cat.name)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${cat.color}20` }}
                >
                  <Icon className="h-6 w-6" style={{ color: cat.color || undefined }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {cat.description}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-sm text-muted-foreground">
                    {cat.topic_count || 0} topics · {cat.post_count || 0} posts
                  </div>
                  {cat.last_post_at && (
                    <div className="text-xs text-muted-foreground/70">
                      Last post {formatDistanceToNow(new Date(cat.last_post_at), { addSuffix: true })}
                    </div>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ForumCategoryList;
