import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  School, Plus, Trash2, Loader2, Sparkles, TrendingUp, Target,
  CheckCircle2, MapPin, Phone, ChevronDown, ChevronUp
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const FIT_COLORS: Record<string, string> = {
  likely: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  target: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  reach: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
};

const STATUS_COLORS: Record<string, string> = {
  interested: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  visited: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  offered: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export const CollegeTargetsSection = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newSchool, setNewSchool] = useState("");
  const [newDivision, setNewDivision] = useState("D3");
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => { const { data: { user } } = await supabase.auth.getUser(); return user; },
  });

  const { data: targets, isLoading } = useQuery({
    queryKey: ["college-targets"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase.from("college_targets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !newSchool.trim()) throw new Error("Invalid input");
      const { error } = await supabase.from("college_targets").insert({
        user_id: user.id,
        school_name: newSchool.trim(),
        division: newDivision,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewSchool("");
      queryClient.invalidateQueries({ queryKey: ["college-targets"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("college_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["college-targets"] }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("college_targets").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["college-targets"] }),
  });

  const scoreMutation = useMutation({
    mutationFn: async (target_id: string) => {
      if (!currentUser) throw new Error("Not authenticated");
      setScoringId(target_id);
      const session = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/score-college-targets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": API_KEY,
          "Authorization": `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ user_id: currentUser.id, target_id }),
      });
      if (!res.ok) throw new Error("Scoring failed");
      return res.json();
    },
    onSuccess: () => {
      setScoringId(null);
      queryClient.invalidateQueries({ queryKey: ["college-targets"] });
      toast({ title: "Fit score updated!" });
    },
    onError: (e: any) => {
      setScoringId(null);
      toast({ title: "Scoring failed", description: e.message, variant: "destructive" });
    },
  });

  const grouped = {
    D1: (targets || []).filter((t: any) => t.division === "D1"),
    D2: (targets || []).filter((t: any) => t.division === "D2"),
    D3: (targets || []).filter((t: any) => t.division === "D3"),
    NAIA: (targets || []).filter((t: any) => t.division === "NAIA"),
    Club: (targets || []).filter((t: any) => t.division === "Club"),
  };

  return (
    <div className="space-y-6">
      {/* Add school */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Target School</CardTitle>
          <CardDescription>Add schools to your list and get an AI fit score based on your stats</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Input
            placeholder="School name (e.g. Yale University)"
            value={newSchool}
            onChange={(e) => setNewSchool(e.target.value)}
            className="flex-1 min-w-48"
            onKeyDown={(e) => e.key === "Enter" && newSchool.trim() && addMutation.mutate()}
          />
          <Select value={newDivision} onValueChange={setNewDivision}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="D1">D1</SelectItem>
              <SelectItem value="D2">D2</SelectItem>
              <SelectItem value="D3">D3</SelectItem>
              <SelectItem value="NAIA">NAIA</SelectItem>
              <SelectItem value="Club">Club</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => newSchool.trim() && addMutation.mutate()} disabled={addMutation.isPending || !newSchool.trim()}>
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1">Add</span>
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !targets?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <School className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No target schools yet. Add your first one above.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([div, divTargets]) =>
          divTargets.length === 0 ? null : (
            <div key={div}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{div} Schools</h3>
              <div className="space-y-3">
                {divTargets.map((t: any) => (
                  <Card key={t.id} className="overflow-hidden">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold">{t.school_name}</h4>
                            <Badge variant="outline" className="text-xs">{t.division}</Badge>
                            {t.fit_score && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${FIT_COLORS[t.fit_score] || ""}`}>
                                {t.fit_score.charAt(0).toUpperCase() + t.fit_score.slice(1)}
                              </span>
                            )}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] || ""}`}>
                              {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                            </span>
                          </div>

                          {t.fit_notes && (
                            <p className="text-sm text-muted-foreground mt-1.5">{t.fit_notes}</p>
                          )}

                          {t.improve_notes && t.fit_score !== "likely" && (
                            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5">
                              <TrendingUp className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                              <span>{t.improve_notes}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => scoreMutation.mutate(t.id)}
                            disabled={scoringId === t.id}
                            title="Get AI fit score"
                          >
                            {scoringId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Status controls */}
                      <div className="mt-3 flex gap-1.5 flex-wrap">
                        {["interested", "contacted", "visited", "offered"].map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatusMutation.mutate({ id: t.id, status: s })}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              t.status === s
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border hover:border-primary/50 text-muted-foreground"
                            }`}
                          >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        )
      )}

      {targets && targets.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-sm">How fit scores work</p>
            <p><span className="font-medium text-green-600">Likely</span> — Your stats exceed typical standards for this division</p>
            <p><span className="font-medium text-blue-600">Target</span> — You're within the typical range for this division</p>
            <p><span className="font-medium text-orange-600">Reach</span> — You'd need improvement to be recruited at this level</p>
            <p className="pt-1">Tap <Sparkles className="h-3 w-3 inline" /> to run the AI analysis on any school.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
