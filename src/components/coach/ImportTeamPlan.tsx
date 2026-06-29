import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAI } from "@/lib/aiInvoke";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  teamId: string;
  coachId: string;
}

type Step = "idle" | "parsing" | "personalizing" | "done" | "error";

const ImportTeamPlan = ({ teamId, coachId }: Props) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<{ athletes_updated: number; total_weeks: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const handleSubmit = async () => {
    if (!file) {
      toast({ title: "No file selected", variant: "destructive" });
      return;
    }

    setStep("parsing");
    setErrorMsg("");

    try {
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      setStep("personalizing");

      const { data, error } = await invokeAI("import-team-plan", {
        body: {
          team_id: teamId,
          coach_id: coachId,
          file_content: fileContent,
          file_name: file.name,
          title: title || file.name,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setResult({ athletes_updated: data.athletes_updated, total_weeks: data.total_weeks });
      setStep("done");
    } catch (err: any) {
      setErrorMsg(err.message || "Unknown error");
      setStep("error");
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
  };

  const reset = () => {
    setStep("idle");
    setFile(null);
    setTitle("");
    setResult(null);
    setErrorMsg("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Team Training Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "done" && result ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-lg font-semibold text-center">Plan Imported!</p>
                <p className="text-sm text-muted-foreground text-center">
                  {result.total_weeks}-week plan created and pushed to {result.athletes_updated} athlete
                  {result.athletes_updated !== 1 ? "s" : ""}.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={reset}>
                Import Another Plan
              </Button>
            </div>
          ) : (
            <>
              {/* File picker */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Training Plan File</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                  disabled={step !== "idle"}
                />
                <p className="text-xs text-muted-foreground">Accepts .csv, .xlsx, .xls, .txt</p>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Plan Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Spring 2026 Training Block"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={step !== "idle"}
                />
              </div>

              {/* Progress */}
              {(step === "parsing" || step === "personalizing") && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/60">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <p className="text-sm">
                    {step === "parsing"
                      ? "Parsing spreadsheet with AI..."
                      : "Personalizing for all athletes..."}
                  </p>
                </div>
              )}

              {step === "error" && errorMsg && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={!file || step === "parsing" || step === "personalizing"}
              >
                {step === "parsing" || step === "personalizing" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Import & Push to Athletes</>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportTeamPlan;
