import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Star, ChevronDown, ChevronUp } from "lucide-react";

const CATEGORIES = [
  { key: "set_and_balance", label: "Set & Balance" },
  { key: "timing", label: "Timing" },
  { key: "drive_length", label: "Drive Length" },
  { key: "bladework", label: "Bladework" },
  { key: "focus", label: "Focus" },
] as const;

interface Props {
  sessionId: string;
  teamId: string;
  userId: string;
}

function RatingStars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`h-6 w-6 transition-colors ${n <= value ? "text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`}
        >
          <Star className="h-5 w-5 fill-current" />
        </button>
      ))}
    </div>
  );
}

const CoxRatings = ({ sessionId, teamId, userId }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({
    set_and_balance: 3, timing: 3, drive_length: 3, bladework: 3, focus: 3,
  });
  const [notes, setNotes] = useState("");

  const { data: allRatings = [] } = useQuery({
    queryKey: ["cox-ratings", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cox_technical_ratings" as any)
        .select("*, rater:profiles!cox_technical_ratings_rated_by_fkey(full_name, username)")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!sessionId,
  });

  const submitRating = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cox_technical_ratings" as any).insert({
        session_id: sessionId,
        team_id: teamId,
        rated_by: userId,
        ...ratings,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Rating submitted!" });
      queryClient.invalidateQueries({ queryKey: ["cox-ratings", sessionId] });
      setOpen(false);
      setRatings({ set_and_balance: 3, timing: 3, drive_length: 3, bladework: 3, focus: 3 });
      setNotes("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const avgRating = (allRatings as any[]).length > 0
    ? (allRatings as any[]).reduce((sum: number, r: any) => {
        const total = (r.set_and_balance || 0) + (r.timing || 0) + (r.drive_length || 0) + (r.bladework || 0) + (r.focus || 0);
        return sum + total;
      }, 0) / (allRatings as any[]).length
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">Technical Ratings</h4>
          {avgRating !== null && (
            <Badge variant="outline" className="text-xs gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {avgRating.toFixed(1)}/25
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(!open)}>
          <Star className="h-3 w-3" />Rate
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {open && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-3 space-y-3">
            {CATEGORIES.map(cat => (
              <div key={cat.key} className="flex items-center justify-between">
                <Label className="text-xs w-28 shrink-0">{cat.label}</Label>
                <RatingStars
                  value={ratings[cat.key] || 0}
                  onChange={v => setRatings(r => ({ ...r, [cat.key]: v }))}
                />
                <span className="text-xs text-muted-foreground w-4 text-right">{ratings[cat.key]}</span>
              </div>
            ))}
            <div>
              <Textarea className="text-xs min-h-[50px] resize-none" placeholder="Notes..."
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Total: {Object.values(ratings).reduce((s, v) => s + v, 0)}/25
              </span>
              <Button size="sm" className="h-7 text-xs" onClick={() => submitRating.mutate()} disabled={submitRating.isPending}>
                Submit
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(allRatings as any[]).length > 0 && (
        <div className="space-y-1">
          {(allRatings as any[]).slice(0, 3).map((r: any) => {
            const total = (r.set_and_balance || 0) + (r.timing || 0) + (r.drive_length || 0) + (r.bladework || 0) + (r.focus || 0);
            const raterName = r.rater?.full_name || r.rater?.username || "Anonymous";
            return (
              <div key={r.id} className="text-xs flex items-center gap-2 text-muted-foreground">
                <span>{raterName}:</span>
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={`h-2.5 w-2.5 ${i <= Math.round(total/5) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                  ))}
                </div>
                <span className="font-medium text-foreground">{total}/25</span>
                {r.notes && <span className="truncate max-w-[120px]">— {r.notes}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CoxRatings;
