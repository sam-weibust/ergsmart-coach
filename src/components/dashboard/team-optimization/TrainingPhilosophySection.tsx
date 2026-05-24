import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, RefreshCw, RotateCcw, CheckCircle2, FileSpreadsheet, Loader2, Brain } from "lucide-react";
import { getSessionUser } from "@/lib/getUser";

interface Props {
  teamId: string;
  isCoach: boolean;
}

export default function TrainingPhilosophySection({ teamId, isCoach }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [extractedResult, setExtractedResult] = useState<any>(null);

  const { data: philosophy, isLoading } = useQuery({
    queryKey: ["team-training-philosophy", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_training_philosophy")
        .select("*")
        .eq("team_id", teamId)
        .maybeSingle();
      return data;
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("team_training_philosophy")
        .delete()
        .eq("team_id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      setExtractedResult(null);
      qc.invalidateQueries({ queryKey: ["team-training-philosophy", teamId] });
      toast({ title: "Reset to default", description: "Using CrewSync Default Training Methodology." });
    },
    onError: (e: Error) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  async function handleFileUpload(file: File) {
    if (!isCoach) return;
    setUploading(true);
    setExtractedResult(null);

    try {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["csv", "xlsx", "xls", "txt"].includes(ext || "")) {
        throw new Error("Please upload a CSV or Excel file");
      }

      // Upload file to Supabase storage
      const filePath = `${teamId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("training-files")
        .upload(filePath, file, { upsert: false });
      if (upErr) throw upErr;

      // Call analyze-training-philosophy edge function
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("analyze-training-philosophy", {
        body: { team_id: teamId, coach_id: user.id, file_path: filePath, file_name: file.name },
      });

      if (fnErr) throw new Error(fnErr.message);
      if (fnData?.error) throw new Error(fnData.error);

      setExtractedResult(fnData);
      qc.invalidateQueries({ queryKey: ["team-training-philosophy", teamId] });
      toast({ title: "Philosophy learned", description: "AI has analyzed your training methodology." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const displayResult = extractedResult || (philosophy ? { summary: philosophy.summary, philosophy: philosophy.philosophy } : null);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Training Philosophy
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Your training philosophy is used to generate all AI plans for your team. Upload past training plans to teach the AI your coaching style.
        </p>
      </div>

      {/* Status */}
      <div className="rounded-xl border bg-muted/40 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Current Philosophy</p>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : philosophy ? (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Custom methodology — last updated {new Date(philosophy.updated_at).toLocaleDateString()}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Using default: CrewSync Training Methodology</p>
          )}
        </div>
        <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
      </div>

      {/* Upload area */}
      {isCoach && (
        <div className="space-y-3">
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Upload Training Spreadsheet</p>
            <p className="text-xs text-muted-foreground mt-1">CSV or Excel (.xlsx, .xls) — past training plans, season schedules</p>
            <Button
              className="mt-4"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing…
                </>
              ) : philosophy ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-upload
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </>
              )}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
            />
          </div>
        </div>
      )}

      {/* Extracted summary */}
      {displayResult && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">What the AI Learned</h4>

          {displayResult.summary && (
            <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              {displayResult.summary}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {displayResult.philosophy?.weekly_structure && (
              <PhilCard
                title="Weekly Structure"
                value={displayResult.philosophy.weekly_structure}
              />
            )}
            {displayResult.philosophy?.zone_system && (
              <PhilCard
                title="Zone System"
                value={displayResult.philosophy.zone_system}
              />
            )}
            {displayResult.philosophy?.loading_cycle && (
              <PhilCard
                title="Loading Approach"
                value={displayResult.philosophy.loading_cycle}
              />
            )}
            {displayResult.philosophy?.periodization && (
              <PhilCard
                title="Periodization"
                value={displayResult.philosophy.periodization}
              />
            )}
            {displayResult.philosophy?.piece_structures && (
              <PhilCard
                title="Preferred Workout Types"
                value={displayResult.philosophy.piece_structures}
              />
            )}
            {displayResult.philosophy?.terminology && (
              <PhilCard
                title="Coach Terminology"
                value={displayResult.philosophy.terminology}
              />
            )}
          </div>
        </div>
      )}

      {/* Reset to default */}
      {isCoach && philosophy && (
        <div className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            disabled={resetMutation.isPending}
            onClick={() => {
              if (confirm("Reset to CrewSync Default Training Methodology? Your custom philosophy will be removed.")) {
                resetMutation.mutate();
              }
            }}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {resetMutation.isPending ? "Resetting…" : "Reset to Default"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">Reverts all AI plan generation to the CrewSync Default Training Methodology.</p>
        </div>
      )}
    </div>
  );
}

function PhilCard({ title, value }: { title: string; value: any }) {
  const text = typeof value === "string"
    ? value
    : Array.isArray(value)
    ? value.slice(0, 6).join(", ")
    : JSON.stringify(value).slice(0, 200);

  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
      <p className="text-sm text-foreground line-clamp-3">{text}</p>
    </div>
  );
}
