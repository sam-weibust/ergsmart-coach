import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Heart, Mail, Clipboard, Flag, User, ExternalLink,
  TrendingUp, Loader2, BookmarkPlus,
} from "lucide-react";
import { AthleteProfile, BoardStatus } from "./types";
import { fmtSeconds, cmToFtIn, kgToLbs } from "./utils";

interface Props {
  athlete: AthleteProfile | null;
  coachId: string;
  coachProfile: any;
  onClose: () => void;
  onOpenEmail: (athlete: AthleteProfile) => void;
}

export function AthleteProfilePanel({ athlete, coachId, coachProfile, onClose, onOpenEmail }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [boardNote, setBoardNote] = useState("");

  const { data: isFollowing } = useQuery({
    queryKey: ["coach-following", coachId, athlete?.user_id],
    enabled: !!athlete,
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_followed_athletes")
        .select("id")
        .eq("coach_id", coachId)
        .eq("athlete_user_id", athlete!.user_id)
        .maybeSingle();
      return !!data;
    },
  });

  const { data: boardEntry } = useQuery({
    queryKey: ["board-entry", coachId, athlete?.user_id],
    enabled: !!athlete,
    queryFn: async () => {
      const { data } = await supabase
        .from("recruiting_board")
        .select("*")
        .eq("coach_id", coachId)
        .eq("athlete_user_id", athlete!.user_id)
        .maybeSingle();
      return data;
    },
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        await supabase.from("coach_followed_athletes")
          .delete()
          .eq("coach_id", coachId)
          .eq("athlete_user_id", athlete!.user_id);
      } else {
        await supabase.from("coach_followed_athletes").insert({
          coach_id: coachId,
          athlete_user_id: athlete!.user_id,
        });
        // Create notification for athlete
        await supabase.from("notifications").insert({
          user_id: athlete!.user_id,
          type: "coach_follow",
          title: "A coach viewed your recruiting profile",
          message: `A coach from ${coachProfile?.school_name ?? "a program"} is now following your recruiting profile.`,
          related_coach_id: coachId,
          related_program_name: coachProfile?.school_name ?? null,
        }).select();
        // Non-blocking email notification
        supabase.functions.invoke("send-notification-email", {
          body: {
            type: "coach_viewed_profile",
            recipientUserId: athlete!.user_id,
            coachSchool: coachProfile?.school_name ?? undefined,
          },
        }).catch((e) => console.error("Email notification error:", e));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coach-following"] });
      qc.invalidateQueries({ queryKey: ["coach-followed-athletes"] });
      toast({ title: isFollowing ? "Unfollowed" : "Following athlete" });
    },
  });

  const addToBoardMutation = useMutation({
    mutationFn: async (status: BoardStatus) => {
      await supabase.from("recruiting_board").upsert({
        coach_id: coachId,
        athlete_user_id: athlete!.user_id,
        status,
        notes: boardNote || null,
      }, { onConflict: "coach_id,athlete_user_id" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recruiting-board"] });
      qc.invalidateQueries({ queryKey: ["board-entry"] });
      toast({ title: "Added to recruiting board" });
    },
  });

  const flagMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("coach_flagged_athletes").upsert({
        coach_id: coachId,
        athlete_user_id: athlete!.user_id,
      }, { onConflict: "coach_id,athlete_user_id" });
      await supabase.from("recruit_scores")
        .delete()
        .eq("coach_id", coachId)
        .eq("athlete_user_id", athlete!.user_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recruit-discover"] });
      toast({ title: "Athlete flagged — won't appear in feed" });
      onClose();
    },
  });

  // Record view
  const recordView = async () => {
    if (!athlete || !coachId) return;
    await supabase.from("coach_athlete_views").insert({
      coach_id: coachId,
      athlete_user_id: athlete.user_id,
    });
    await supabase.from("athlete_profiles")
      .update({ coach_view_count: (athlete.coach_view_count ?? 0) + 1 })
      .eq("user_id", athlete.user_id);
  };

  if (athlete) recordView();

  const name = athlete?.profiles?.full_name ?? "Athlete";

  return (
    <Sheet open={!!athlete} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {athlete && (
          <>
            <SheetHeader className="pb-4 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {athlete.avatar_url ? (
                    <img src={athlete.avatar_url} alt={name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <User className="h-7 w-7 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <SheetTitle className="text-lg">{name}</SheetTitle>
                  <p className="text-sm text-muted-foreground">
                    {[athlete.school, athlete.location].filter(Boolean).join(" · ")}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {athlete.grad_year && <Badge variant="secondary" className="text-xs">Class of {athlete.grad_year}</Badge>}
                    {athlete.division_interest && <Badge variant="outline" className="text-xs">{athlete.division_interest}</Badge>}
                    {athlete.relevance_score != null && (
                      <Badge className="text-xs bg-primary">Fit Score: {athlete.relevance_score}</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  size="sm"
                  variant={isFollowing ? "default" : "outline"}
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                >
                  <Heart className={`h-4 w-4 mr-1.5 ${isFollowing ? "fill-current" : ""}`} />
                  {isFollowing ? "Following" : "Follow"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onOpenEmail(athlete)}>
                  <Mail className="h-4 w-4 mr-1.5" />
                  Contact
                </Button>
                <Button
                  size="sm"
                  variant={boardEntry ? "default" : "outline"}
                  onClick={() => addToBoardMutation.mutate("watching")}
                  disabled={addToBoardMutation.isPending}
                >
                  <BookmarkPlus className="h-4 w-4 mr-1.5" />
                  {boardEntry ? "On Board" : "Add to Board"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => flagMutation.mutate()}
                  disabled={flagMutation.isPending}
                >
                  <Flag className="h-4 w-4 mr-1.5" />
                  Not a Fit
                </Button>
              </div>
            </SheetHeader>

            <div className="space-y-5 py-4">
              {/* Stats */}
              <Section title="Performance">
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Best 2k" value={fmtSeconds(athlete.best_2k?.time_seconds)} />
                  <StatCard label="Watts/kg" value={athlete.best_2k?.watts_per_kg?.toFixed(2) ?? "—"} />
                  <StatCard label="VCS" value={athlete.combine_score != null ? String(athlete.combine_score) : "—"} />
                  <StatCard label="Height" value={cmToFtIn(athlete.profiles?.height)} />
                  <StatCard label="Weight" value={kgToLbs(athlete.profiles?.weight)} />
                  <StatCard label="GPA" value={athlete.gpa ? athlete.gpa.toFixed(2) : "—"} />
                </div>
              </Section>

              {/* AI Fit Reasoning */}
              {athlete.relevance_reasoning && (
                <Section title="AI Fit Analysis">
                  <div className="bg-primary/5 rounded-xl p-3 text-sm text-foreground flex gap-2">
                    <TrendingUp className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <p>{athlete.relevance_reasoning}</p>
                  </div>
                </Section>
              )}

              {/* Bio */}
              {athlete.bio && (
                <Section title="Bio">
                  <p className="text-sm text-foreground">{athlete.bio}</p>
                </Section>
              )}

              {/* Personal Statement */}
              {athlete.personal_statement && (
                <Section title="Personal Statement">
                  <p className="text-sm text-foreground">{athlete.personal_statement}</p>
                </Section>
              )}

              {/* Academic */}
              <Section title="Academic">
                <div className="flex flex-wrap gap-3 text-sm">
                  {athlete.intended_major && <Info label="Major" value={athlete.intended_major} />}
                  {athlete.gpa && <Info label="GPA" value={athlete.gpa.toFixed(2)} />}
                </div>
              </Section>

              {/* Video */}
              {athlete.highlight_video_url && (
                <Section title="Highlight Video">
                  <a
                    href={athlete.highlight_video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Watch highlight video
                  </a>
                </Section>
              )}

              {/* Board note */}
              <Section title="Board Notes">
                <Textarea
                  placeholder="Add notes about this recruit..."
                  value={boardNote || boardEntry?.notes || ""}
                  onChange={(e) => setBoardNote(e.target.value)}
                  className="text-sm min-h-[80px]"
                />
                {boardNote && (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => addToBoardMutation.mutate(boardEntry?.status ?? "watching")}
                    disabled={addToBoardMutation.isPending}
                  >
                    {addToBoardMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Notes"}
                  </Button>
                )}
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h4>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-xl p-2.5 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}: </span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
