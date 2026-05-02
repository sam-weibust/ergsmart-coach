import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Mail, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ROLE_LABELS: Record<string, string> = {
  head_coach: "Head Coach",
  assistant_coach: "Assistant Coach",
  volunteer_coach: "Volunteer Coach",
};

const ROLE_BADGE_CLASS: Record<string, string> = {
  head_coach: "bg-blue-700 text-white",
  assistant_coach: "bg-blue-400 text-white",
  volunteer_coach: "bg-gray-500 text-white",
};

interface Props {
  teamId: string;
  teamName: string;
  isCoach: boolean;
  profile: any;
}

const CoachManagement = ({ teamId, teamName, isCoach, profile }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("assistant_coach");

  const { data: team } = useQuery({
    queryKey: ["team-info", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, coach_id, join_code, profiles!teams_coach_id_fkey(id, full_name, email, username)")
        .eq("id", teamId)
        .maybeSingle();
      return data;
    },
  });

  const { data: coaches = [] } = useQuery({
    queryKey: ["team-coaches", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_coaches")
        .select("*, profile:profiles(id, full_name, email, username)")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["coach-invites", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_invites")
        .select("*")
        .eq("team_id", teamId)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString());
      return data || [];
    },
  });

  const headCoachProfile = Array.isArray((team as any)?.profiles)
    ? (team as any).profiles[0]
    : (team as any)?.profiles;

  const isHeadCoach =
    (team as any)?.coach_id === profile?.id ||
    coaches.some((c: any) => c.user_id === profile?.id && c.role === "head_coach");

  const sendInvite = useMutation({
    mutationFn: async () => {
      if (!inviteEmail.trim()) throw new Error("Email is required");
      const { error } = await supabase.functions.invoke("invite-coach", {
        body: { team_id: teamId, team_name: teamName, email: inviteEmail.trim(), role: inviteRole },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Invite sent!" });
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ["coach-invites", teamId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const changeRole = useMutation({
    mutationFn: async ({ coachId, role }: { coachId: string; role: string }) => {
      const { error } = await supabase.from("team_coaches").update({ role }).eq("id", coachId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-coaches", teamId] }),
  });

  const removeCoach = useMutation({
    mutationFn: async (coachId: string) => {
      const { error } = await supabase.from("team_coaches").delete().eq("id", coachId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Coach removed" });
      queryClient.invalidateQueries({ queryKey: ["team-coaches", teamId] });
    },
  });

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("coach_invites").delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach-invites", teamId] }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Coaching Staff
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Head coach */}
        {headCoachProfile && (
          <div className="flex items-center justify-between p-2.5 border rounded-lg text-sm bg-muted/30">
            <div>
              <p className="font-medium">{headCoachProfile.full_name || headCoachProfile.username || headCoachProfile.email}</p>
              <p className="text-xs text-muted-foreground">{headCoachProfile.email}</p>
            </div>
            <Badge className="bg-blue-700 text-white text-xs">Head Coach</Badge>
          </div>
        )}

        {/* Additional coaches */}
        {coaches.map((coach: any) => {
          const p = coach.profile;
          return (
            <div key={coach.id} className="flex items-center justify-between p-2.5 border rounded-lg text-sm">
              <div className="flex-1 min-w-0 mr-2">
                <p className="font-medium truncate">{p?.full_name || p?.username || p?.email || "Unknown"}</p>
                <p className="text-xs text-muted-foreground truncate">{p?.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isHeadCoach ? (
                  <Select
                    value={coach.role}
                    onValueChange={(v) => changeRole.mutate({ coachId: coach.id, role: v })}
                  >
                    <SelectTrigger className="h-7 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assistant_coach">Assistant Coach</SelectItem>
                      <SelectItem value="volunteer_coach">Volunteer Coach</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={`text-xs ${ROLE_BADGE_CLASS[coach.role] || ""}`}>
                    {ROLE_LABELS[coach.role] || coach.role}
                  </Badge>
                )}
                {isHeadCoach && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Coach</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove {p?.full_name || p?.email} from the coaching staff?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removeCoach.mutate(coach.id)}>Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          );
        })}

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Invites</p>
            {pendingInvites.map((invite: any) => (
              <div key={invite.id} className="flex items-center justify-between p-2.5 border border-dashed rounded-lg text-sm">
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[invite.role] || invite.role} · Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </p>
                </div>
                {isHeadCoach && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => revokeInvite.mutate(invite.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Invite form */}
        {isHeadCoach && (
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Invite a Coach</p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="coach@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendInvite.mutate()}
                className="flex-1"
              />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assistant_coach">Assistant</SelectItem>
                  <SelectItem value="volunteer_coach">Volunteer</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" onClick={() => sendInvite.mutate()} disabled={sendInvite.isPending}>
                <Mail className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              They'll receive an email with a link to join as a coach.
            </p>
          </div>
        )}

        {/* Team join code */}
        {(team as any)?.join_code && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Team join code: <span className="font-mono font-semibold text-foreground">{(team as any).join_code}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CoachManagement;
