import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Plus, Trash2, Sparkles } from "lucide-react";
import { displayName } from "./constants";

function BetaBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full font-semibold">
      <Sparkles className="h-2.5 w-2.5" />
      Free During Beta · Elite Team Fall 2026
    </span>
  );
}

interface Props {
  teamId: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

export default function ParentEmailSection({ teamId, teamMembers, isCoach, profile }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [relationship, setRelationship] = useState("Guardian");
  const [teamNote, setTeamNote] = useState("");
  const [athleteNotes, setAthleteNotes] = useState<Record<string, string>>({});

  const { data: settings } = useQuery({
    queryKey: ["parent-email-settings", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("parent_email_settings" as any)
        .select("*")
        .eq("team_id", teamId)
        .maybeSingle();
      if (data?.team_note) setTeamNote(data.team_note);
      return data;
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["parent-contacts", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("parent_contacts" as any)
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["parent-email-notes", teamId],
    queryFn: async () => {
      const weekStart = getWeekStart();
      const { data } = await supabase
        .from("parent_email_notes" as any)
        .select("*")
        .eq("team_id", teamId)
        .eq("week_of", weekStart);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((n: any) => { map[n.athlete_id] = n.individual_note || ""; });
        setAthleteNotes(map);
      }
      return data || [];
    },
  });

  function getWeekStart() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split("T")[0];
  }

  const upsertSettings = useMutation({
    mutationFn: async (update: Record<string, any>) => {
      const { error } = await supabase.from("parent_email_settings" as any).upsert({
        team_id: teamId,
        ...settings,
        ...update,
        updated_at: new Date().toISOString(),
      }, { onConflict: "team_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      qc.invalidateQueries({ queryKey: ["parent-email-settings", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addContact = useMutation({
    mutationFn: async (athleteId: string) => {
      if (!parentName.trim() || !parentEmail.trim()) throw new Error("Name and email required");
      const { error } = await supabase.from("parent_contacts" as any).insert({
        team_id: teamId,
        athlete_id: athleteId,
        parent_name: parentName.trim(),
        parent_email: parentEmail.trim().toLowerCase(),
        relationship,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Parent contact added" });
      setAddingFor(null);
      setParentName(""); setParentEmail(""); setRelationship("Guardian");
      qc.invalidateQueries({ queryKey: ["parent-contacts", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parent_contacts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["parent-contacts", teamId] }); },
  });

  const saveNote = useMutation({
    mutationFn: async ({ athleteId, note }: { athleteId: string; note: string }) => {
      const { error } = await supabase.from("parent_email_notes" as any).upsert({
        team_id: teamId,
        athlete_id: athleteId,
        coach_id: profile.id,
        week_of: getWeekStart(),
        individual_note: note,
      }, { onConflict: "team_id,athlete_id,week_of" });
      if (error) throw error;
    },
    onSuccess: () => toast({ title: "Note saved" }),
  });

  const athletes = teamMembers.filter((m: any) => m.profile?.role !== "coach");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-bold text-foreground">Weekly Parent Emails</h3>
            <p className="text-xs text-muted-foreground">Automated weekly training updates to parents</p>
          </div>
        </div>
        <BetaBadge />
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between border rounded-xl px-4 py-3 bg-muted/40">
        <div>
          <p className="text-sm font-semibold">Enable Weekly Emails</p>
          <p className="text-xs text-muted-foreground">Sends automatically every {settings?.send_day || "Sunday"} at {settings?.send_hour || 18}:00</p>
        </div>
        <Switch
          checked={!!settings?.enabled}
          disabled={!isCoach}
          onCheckedChange={(val) => upsertSettings.mutate({ enabled: val })}
        />
      </div>

      {/* Send schedule */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Send Day</Label>
          <Select
            value={settings?.send_day || "Sunday"}
            disabled={!isCoach}
            onValueChange={(val) => upsertSettings.mutate({ send_day: val })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Send Hour (24h)</Label>
          <Select
            value={String(settings?.send_hour ?? 18)}
            disabled={!isCoach}
            onValueChange={(val) => upsertSettings.mutate({ send_hour: parseInt(val) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem key={i} value={String(i)}>{String(i).padStart(2, "0")}:00</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Team-wide note */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Team-Wide Note This Week (optional)</Label>
        <Textarea
          value={teamNote}
          disabled={!isCoach}
          onChange={(e) => setTeamNote(e.target.value)}
          placeholder="Message that appears in all parent emails this week..."
          className="text-sm min-h-[70px]"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!isCoach}
          onClick={() => upsertSettings.mutate({ team_note: teamNote })}
        >
          Save Team Note
        </Button>
      </div>

      {/* Athlete list */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Athletes & Parent Contacts</p>
        {athletes.length === 0 && (
          <p className="text-sm text-muted-foreground">No athletes on roster.</p>
        )}
        {athletes.map((m: any) => {
          const name = displayName(m.profile);
          const athleteContacts = contacts.filter((c: any) => c.athlete_id === m.user_id);
          const isAdding = addingFor === m.user_id;

          return (
            <div key={m.user_id} className="border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{name}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${athleteContacts.length > 0 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {athleteContacts.length > 0 ? `${athleteContacts.length} contact${athleteContacts.length > 1 ? "s" : ""}` : "No contact"}
                  </span>
                  {isCoach && !isAdding && (
                    <Button size="sm" variant="outline" onClick={() => setAddingFor(m.user_id)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
              </div>

              {athleteContacts.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between text-xs text-muted-foreground pl-2">
                  <span>{c.parent_name} ({c.relationship}) · {c.parent_email}</span>
                  {isCoach && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => removeContact.mutate(c.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}

              {isAdding && (
                <div className="pl-2 space-y-2 pt-1 border-t border-border mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Parent name"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      className="text-xs h-8"
                    />
                    <Select value={relationship} onValueChange={setRelationship}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Mom","Dad","Guardian","Other"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="email"
                    placeholder="parent@email.com"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className="text-xs h-8"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => addContact.mutate(m.user_id)} disabled={addContact.isPending}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingFor(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Individual note */}
              {isCoach && athleteContacts.length > 0 && (
                <div className="pl-2 space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Coach note for this week</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Optional note to parent..."
                      value={athleteNotes[m.user_id] || ""}
                      onChange={(e) => setAthleteNotes(prev => ({ ...prev, [m.user_id]: e.target.value }))}
                      className="text-xs h-8 flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => saveNote.mutate({ athleteId: m.user_id, note: athleteNotes[m.user_id] || "" })}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
