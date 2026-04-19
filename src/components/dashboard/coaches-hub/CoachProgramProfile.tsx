import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, School } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CoachProfile } from "./types";

interface Props {
  coachId: string;
}

function fmtSeconds(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function parseMmSs(v: string): number | null {
  if (!v) return null;
  if (v.includes(":")) {
    const [m, s] = v.split(":").map(Number);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  const n = parseInt(v);
  return isNaN(n) ? null : n;
}

export function CoachProgramProfile({ coachId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["coach-program-profile", coachId],
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_profiles")
        .select("*")
        .eq("coach_id", coachId)
        .maybeSingle();
      return data as CoachProfile | null;
    },
  });

  const [form, setForm] = useState({
    school_name: "",
    division: "",
    location: "",
    team_type: "",
    program_description: "",
    target_2k_min: "",
    target_2k_max: "",
    target_height_min_cm: "",
    target_height_max_cm: "",
    target_weight_min_kg: "",
    target_weight_max_kg: "",
    port_starboard_preference: "",
  });

  useEffect(() => {
    if (existing) {
      setForm({
        school_name: existing.school_name ?? "",
        division: existing.division ?? "",
        location: existing.location ?? "",
        team_type: existing.team_type ?? "",
        program_description: existing.program_description ?? "",
        target_2k_min: fmtSeconds(existing.target_2k_min_seconds),
        target_2k_max: fmtSeconds(existing.target_2k_max_seconds),
        target_height_min_cm: existing.target_height_min_cm ? String(existing.target_height_min_cm) : "",
        target_height_max_cm: existing.target_height_max_cm ? String(existing.target_height_max_cm) : "",
        target_weight_min_kg: existing.target_weight_min_kg ? String(existing.target_weight_min_kg) : "",
        target_weight_max_kg: existing.target_weight_max_kg ? String(existing.target_weight_max_kg) : "",
        port_starboard_preference: existing.port_starboard_preference ?? "",
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        coach_id: coachId,
        school_name: form.school_name || null,
        division: form.division || null,
        location: form.location || null,
        team_type: form.team_type || null,
        program_description: form.program_description || null,
        target_2k_min_seconds: parseMmSs(form.target_2k_min),
        target_2k_max_seconds: parseMmSs(form.target_2k_max),
        target_height_min_cm: form.target_height_min_cm ? Number(form.target_height_min_cm) : null,
        target_height_max_cm: form.target_height_max_cm ? Number(form.target_height_max_cm) : null,
        target_weight_min_kg: form.target_weight_min_kg ? Number(form.target_weight_min_kg) : null,
        target_weight_max_kg: form.target_weight_max_kg ? Number(form.target_weight_max_kg) : null,
        port_starboard_preference: form.port_starboard_preference || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("coach_profiles").upsert(payload, { onConflict: "coach_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coach-program-profile"] });
      toast({ title: "Program profile saved" });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <School className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-base font-semibold">Program Profile</h2>
          <p className="text-xs text-muted-foreground">Used by AI to calculate recruit fit scores and recommendations</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Program Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">School Name</Label>
              <Input value={form.school_name} onChange={(e) => set("school_name", e.target.value)} placeholder="University of..." className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Division</Label>
              <Select value={form.division} onValueChange={(v) => set("division", v)}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Select division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="D1">D1</SelectItem>
                  <SelectItem value="D2">D2</SelectItem>
                  <SelectItem value="D3">D3</SelectItem>
                  <SelectItem value="NAIA">NAIA</SelectItem>
                  <SelectItem value="Club">Club</SelectItem>
                  <SelectItem value="High School">High School</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City, State" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Team Type</Label>
              <Select value={form.team_type} onValueChange={(v) => set("team_type", v)}>
                <SelectTrigger className="mt-1 h-8 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="varsity">Varsity</SelectItem>
                  <SelectItem value="club">Club</SelectItem>
                  <SelectItem value="high_school">High School</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Program Description</Label>
            <Textarea
              value={form.program_description}
              onChange={(e) => set("program_description", e.target.value)}
              placeholder="Describe your program, culture, and what you look for in recruits..."
              className="mt-1 text-sm min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recruiting Targets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Target 2k Time Range (m:ss)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={form.target_2k_min} onChange={(e) => set("target_2k_min", e.target.value)} placeholder="5:30" className="h-8 text-sm" />
              <span className="text-muted-foreground text-xs">to</span>
              <Input value={form.target_2k_max} onChange={(e) => set("target_2k_max", e.target.value)} placeholder="7:00" className="h-8 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Height Range (cm)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={form.target_height_min_cm} onChange={(e) => set("target_height_min_cm", e.target.value)} placeholder="170" className="h-8 text-sm" />
              <span className="text-muted-foreground text-xs">to</span>
              <Input value={form.target_height_max_cm} onChange={(e) => set("target_height_max_cm", e.target.value)} placeholder="210" className="h-8 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Weight Range (kg)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={form.target_weight_min_kg} onChange={(e) => set("target_weight_min_kg", e.target.value)} placeholder="65" className="h-8 text-sm" />
              <span className="text-muted-foreground text-xs">to</span>
              <Input value={form.target_weight_max_kg} onChange={(e) => set("target_weight_max_kg", e.target.value)} placeholder="100" className="h-8 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Port / Starboard Preference</Label>
            <Select value={form.port_starboard_preference} onValueChange={(v) => set("port_starboard_preference", v)}>
              <SelectTrigger className="mt-1 h-8 text-sm">
                <SelectValue placeholder="No preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="port">Port focus</SelectItem>
                <SelectItem value="starboard">Starboard focus</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
        Save Program Profile
      </Button>
    </div>
  );
}
