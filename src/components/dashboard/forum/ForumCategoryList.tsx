import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Zap, Settings, Apple, Users, Trophy, ArrowRight } from "lucide-react";
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
