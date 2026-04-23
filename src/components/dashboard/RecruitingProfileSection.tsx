import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  GraduationCap, Loader2, Download, Link2, ExternalLink, Eye, Youtube
} from "lucide-react";
import jsPDF from "jspdf";
import { getSessionUser } from '@/lib/getUser';

const fmtSplit = (s: string | null) => {
  if (!s) return "—";
  if (typeof s === "string" && s.includes(":")) return s;
  const sec = parseFloat(String(s));
  if (isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const remainder = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${remainder}`;
};

const cmToDisplay = (cm: number | null) => {
  if (!cm) return "—";
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${ft}'${inches}"`;
};

export const RecruitingProfileSection = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRecruiting, setIsRecruiting] = useState(false);
  const [intendedMajor, setIntendedMajor] = useState("");
  const [divisionInterest, setDivisionInterest] = useState("");
  const [gpa, setGpa] = useState("");
  const [highlightVideoUrl, setHighlightVideoUrl] = useState("");

  // Academic state
  const [psatScore, setPsatScore] = useState("");
  const [satScore, setSatScore] = useState("");
  const [actScore, setActScore] = useState("");
  const [acadGpa, setAcadGpa] = useState("");
  const [gpaWeighted, setGpaWeighted] = useState(false);
  const [classRankNum, setClassRankNum] = useState("");
  const [classRankDen, setClassRankDen] = useState("");
  const [academicInterests, setAcademicInterests] = useState("");

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => { const user = await getSessionUser(); return user; },
  });

  const { data: baseProfile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: ap, isLoading } = useQuery({
    queryKey: ["athlete-profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: academics, isLoading: academicsLoading } = useQuery({
    queryKey: ["athlete-academics"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("athlete_academics").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: goals } = useQuery({
    queryKey: ["user-goals-profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("user_goals").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: bestErg } = useQuery({
    queryKey: ["best-erg"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("erg_workouts").select("*").eq("user_id", user.id).order("workout_date", { ascending: false }).limit(20);
      if (!data) return null;
      return data.reduce((best: any, w: any) => {
        if (!w.avg_split) return best;
        if (!best || String(w.avg_split) < String(best.avg_split)) return w;
        return best;
      }, null);
    },
  });

  useEffect(() => {
    if (!ap) return;
    setIsRecruiting(ap.is_recruiting || false);
    setIntendedMajor(ap.intended_major || "");
    setDivisionInterest(ap.division_interest || "");
    setGpa(ap.gpa ? String(ap.gpa) : "");
    setHighlightVideoUrl(ap.highlight_video_url || "");
  }, [ap]);

  useEffect(() => {
    if (!academics) return;
    setPsatScore(academics.psat_score != null ? String(academics.psat_score) : "");
    setSatScore(academics.sat_score != null ? String(academics.sat_score) : "");
    setActScore(academics.act_score != null ? String(academics.act_score) : "");
    setAcadGpa(academics.gpa != null ? String(academics.gpa) : "");
    setGpaWeighted(academics.gpa_weighted || false);
    setClassRankNum(academics.class_rank_numerator != null ? String(academics.class_rank_numerator) : "");
    setClassRankDen(academics.class_rank_denominator != null ? String(academics.class_rank_denominator) : "");
    setIntendedMajor(prev => academics.intended_major || prev);
    setAcademicInterests(academics.academic_interests || "");
  }, [academics]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");
      const effectiveGpa = acadGpa || gpa;
      const effectiveMajor = intendedMajor;
      const [profileErr, acadErr] = await Promise.all([
        supabase.from("athlete_profiles").upsert({
          user_id: user.id,
          is_recruiting: isRecruiting,
          intended_major: effectiveMajor,
          division_interest: divisionInterest,
          gpa: effectiveGpa ? parseFloat(effectiveGpa) : null,
          highlight_video_url: highlightVideoUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" }).then(r => r.error),
        supabase.from("athlete_academics").upsert({
          user_id: user.id,
          psat_score: psatScore ? parseInt(psatScore) : null,
          sat_score: satScore ? parseInt(satScore) : null,
          act_score: actScore ? parseInt(actScore) : null,
          gpa: acadGpa ? parseFloat(acadGpa) : null,
          gpa_weighted: gpaWeighted,
          class_rank_numerator: classRankNum ? parseInt(classRankNum) : null,
          class_rank_denominator: classRankDen ? parseInt(classRankDen) : null,
          intended_major: effectiveMajor,
          academic_interests: academicInterests || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" }).then(r => r.error),
      ]);
      if (profileErr) throw profileErr;
      if (acadErr) throw acadErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete-profile"] });
      queryClient.invalidateQueries({ queryKey: ["athlete-academics"] });
      toast({ title: "Recruiting profile saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const name = baseProfile?.full_name || baseProfile?.username || "Athlete";
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 45, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(name, margin, 20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const tagline = [ap?.school || "", ap?.grad_year ? `Class of ${ap.grad_year}` : "", ap?.location || ""].filter(Boolean).join(" · ");
    doc.text(tagline, margin, 30);
    if (ap?.contact_email) doc.text(ap.contact_email, margin, 38);
    doc.setTextColor(30, 30, 30);

    let y = 55;
    const sectionTitle = (title: string) => {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 99, 235);
      doc.text(title.toUpperCase(), margin, y);
      y += 1;
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageW - margin, y);
      y += 5;
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "normal");
    };

    const row = (label: string, value: string) => {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(label + ":", margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, margin + 45, y);
      y += 6;
    };

    if (ap?.ai_summary) {
      sectionTitle("Athlete Summary");
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      const lines = doc.splitTextToSize(`"${ap.ai_summary}"`, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 6;
    }

    sectionTitle("Profile");
    row("Height", cmToDisplay(baseProfile?.height));
    row("Weight", baseProfile?.weight ? Math.round(baseProfile.weight * 2.205) + " lbs" : "—");
    row("Division Interest", divisionInterest || "—");
    row("Club Team", ap?.club_team || "—");
    y += 2;

    // Performance
    sectionTitle("Performance");
    row("Best 2K Split", fmtSplit(bestErg?.avg_split));
    row("Best Distance", bestErg ? `${bestErg.distance}m` : "—");
    if (goals?.goal_2k_time) row("2K Goal", goals.goal_2k_time);
    y += 2;

    // Academics
    const effectiveGpa = acadGpa || gpa;
    const hasSomeAcademics = effectiveGpa || satScore || actScore || psatScore || intendedMajor || academicInterests || classRankNum;
    if (hasSomeAcademics) {
      sectionTitle("Academics");
      if (effectiveGpa) row("GPA", `${effectiveGpa}${gpaWeighted ? " (weighted)" : " (unweighted)"} / 4.0`);
      if (satScore) row("SAT", `${satScore} / 1600`);
      if (actScore) row("ACT", `${actScore} / 36`);
      if (psatScore) row("PSAT", `${psatScore} / 1520`);
      if (classRankNum && classRankDen) row("Class Rank", `${classRankNum} of ${classRankDen}`);
      if (intendedMajor) row("Intended Major", intendedMajor);
      if (academicInterests) row("Academic Interests", academicInterests);
      y += 2;
    }

    if (ap?.personal_statement) {
      sectionTitle("Personal Statement");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(ap.personal_statement, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 6;
    }

    const facts = ap?.personal_facts || [];
    if (facts.length > 0) {
      sectionTitle("Facts");
      facts.forEach((f: any) => { row(f.label, f.value); });
      y += 2;
    }

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const profileUrl = baseProfile?.username ? `${window.location.origin}/athlete/${baseProfile.username}` : "";
    doc.text(`Generated by CrewSync · ${new Date().toLocaleDateString()}${profileUrl ? " · " + profileUrl : ""}`, margin, doc.internal.pageSize.getHeight() - 10);
    doc.save(`${name.replace(/\s+/g, "_")}_Recruiting_Profile.pdf`);
    toast({ title: "PDF exported!" });
  };

  const copyRecruitingLink = () => {
    const username = baseProfile?.username;
    if (!username) { toast({ title: "Set a username first", variant: "destructive" }); return; }
    navigator.clipboard.writeText(`${window.location.origin}/athlete/${username}?recruit=1`);
    toast({ title: "Recruiting link copied!" });
  };

  if (isLoading || academicsLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card className={isRecruiting ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : ""}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <GraduationCap className={`h-5 w-5 ${isRecruiting ? "text-green-600" : "text-muted-foreground"}`} />
              <div>
                <p className="font-semibold">{isRecruiting ? "Actively Recruiting" : "Not Actively Recruiting"}</p>
                <p className="text-xs text-muted-foreground">{isRecruiting ? "Coaches can see your recruiting profile" : "Toggle to show coaches you're available"}</p>
              </div>
            </div>
            <Switch checked={isRecruiting} onCheckedChange={setIsRecruiting} />
          </div>
          {ap && ap.coach_view_count > 0 && (
            <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
              <Eye className="h-4 w-4 text-primary" />
              <span className="font-semibold text-primary">{ap.coach_view_count}</span>
              <span className="text-muted-foreground">coach views</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recruiting Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recruiting Details</CardTitle>
          <CardDescription>This info appears on your public recruiting profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Division Interest</Label>
              <Select value={divisionInterest} onValueChange={setDivisionInterest}>
                <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="D1">D1</SelectItem>
                  <SelectItem value="D2">D2</SelectItem>
                  <SelectItem value="D3">D3</SelectItem>
                  <SelectItem value="NAIA">NAIA</SelectItem>
                  <SelectItem value="Club">Club</SelectItem>
                  <SelectItem value="D1/D2">D1 or D2</SelectItem>
                  <SelectItem value="D2/D3">D2 or D3</SelectItem>
                  <SelectItem value="Any">Any Division</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1.5"><Youtube className="h-3.5 w-3.5 text-red-500" />Highlight Video URL</Label>
              <Input placeholder="https://youtube.com/watch?v=..." value={highlightVideoUrl} onChange={(e) => setHighlightVideoUrl(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Academics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            Academics
          </CardTitle>
          <CardDescription>All fields optional — shown on your profile and PDF</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>PSAT <span className="text-muted-foreground font-normal">/ 1520</span></Label>
              <Input type="number" min="320" max="1520" step="10" placeholder="1200" value={psatScore} onChange={(e) => setPsatScore(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SAT <span className="text-muted-foreground font-normal">/ 1600</span></Label>
              <Input type="number" min="400" max="1600" step="10" placeholder="1350" value={satScore} onChange={(e) => setSatScore(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>ACT <span className="text-muted-foreground font-normal">/ 36</span></Label>
              <Input type="number" min="1" max="36" placeholder="30" value={actScore} onChange={(e) => setActScore(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>GPA <span className="text-muted-foreground font-normal">/ 4.0</span></Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{gpaWeighted ? "Weighted" : "Unweighted"}</span>
                  <Switch checked={gpaWeighted} onCheckedChange={setGpaWeighted} />
                </div>
              </div>
              <Input type="number" step="0.01" min="0" max="5" placeholder="3.75" value={acadGpa} onChange={(e) => setAcadGpa(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Class Rank <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="1" placeholder="12" value={classRankNum} onChange={(e) => setClassRankNum(e.target.value)} />
                <span className="text-muted-foreground text-sm shrink-0">of</span>
                <Input type="number" min="1" placeholder="350" value={classRankDen} onChange={(e) => setClassRankDen(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Intended Major</Label>
            <Input placeholder="Biology, Economics, Engineering..." value={intendedMajor} onChange={(e) => setIntendedMajor(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Academic Interests</Label>
            <Input placeholder="Research, pre-med, entrepreneurship, environmental science..." value={academicInterests} onChange={(e) => setAcademicInterests(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Export & Share */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Share & Export</CardTitle>
          <CardDescription>Send coaches a polished recruiting document or link</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Button onClick={exportPDF} variant="outline" className="flex-1">
            <Download className="h-4 w-4 mr-2" />Export PDF
          </Button>
          <Button onClick={copyRecruitingLink} variant="outline" className="flex-1">
            <Link2 className="h-4 w-4 mr-2" />Copy Recruiting Link
          </Button>
          {baseProfile?.username && (
            <Button variant="ghost" size="icon" asChild>
              <a href={`/athlete/${baseProfile.username}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
            </Button>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Recruiting Profile"}
      </Button>
    </div>
  );
};
