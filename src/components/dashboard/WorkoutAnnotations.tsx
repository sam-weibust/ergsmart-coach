import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSessionUser } from '@/lib/getUser';

interface WorkoutAnnotationsProps {
  workoutId: string;
  workoutType: "erg" | "strength";
  athleteId: string;
  isCoach: boolean;
  coachId?: string;
}

export const WorkoutAnnotations = ({ workoutId, workoutType, athleteId, isCoach, coachId }: WorkoutAnnotationsProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInput, setShowInput] = useState(false);
  const [note, setNote] = useState("");

  const { data: annotations } = useQuery({
    queryKey: ["workout-annotations", workoutId],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_annotations")
        .select("*, profiles!workout_annotations_coach_id_fkey(full_name, username)")
        .eq("workout_id", workoutId)
        .eq("workout_type", workoutType)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const addAnnotation = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not logged in");
      const { error } = await supabase.from("workout_annotations").insert({
        workout_id: workoutId,
        workout_type: workoutType,
        coach_id: user.id,
        athlete_id: athleteId,
        note,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout-annotations", workoutId] });
      setNote("");
      setShowInput(false);
      toast({ title: "Note added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add note.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-2">
      {/* Show annotations */}
      {annotations && annotations.length > 0 && (
        <div className="space-y-1">
          {annotations.map((a: any) => (
            <div key={a.id} className="pl-3 border-l-2 border-primary/40 text-sm">
              <span className="text-muted-foreground font-medium">
                Coach {a.profiles?.full_name || a.profiles?.username || ""}:
              </span>{" "}
              <span className="italic">{a.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Coach add note */}
      {isCoach && (
        <>
          {showInput ? (
            <div className="flex gap-2 items-end">
              <Textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note for this athlete..."
                className="min-h-[60px] text-sm"
              />
              <div className="flex flex-col gap-1">
                <Button size="sm" onClick={() => addAnnotation.mutate()} disabled={!note.trim() || addAnnotation.isPending}>
                  {addAnnotation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowInput(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setShowInput(true)} className="gap-1 text-xs h-7">
              <MessageSquarePlus className="h-3 w-3" /> Add Note
            </Button>
          )}
        </>
      )}
    </div>
  );
};
