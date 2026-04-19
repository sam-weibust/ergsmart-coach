import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2, Download, Image, FileText } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

const parseCSV = (text: string): string[][] => {
  const lines = text.split("\n").filter(line => line.trim());
  return lines.map(line => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
};

// Convert CSV workout data to match AI-generated plan format
interface StandardizedDay {
  day: number;
  ergWorkout?: {
    zone: string;
    description: string;
    duration?: string;
    notes?: string;
  };
  strengthWorkout?: {
    focus: string;
    exercises: Array<{
      name: string;
      sets?: number;
      reps?: number;
    }>;
    notes?: string;
  };
}

interface StandardizedWeek {
  week: number;
  phase: string;
  days: StandardizedDay[];
}

const parseWorkoutData = (rows: string[][]): StandardizedWeek[] => {
  const weeks: StandardizedWeek[] = [];
  const headers = rows[0]?.map(h => h.toLowerCase()) || [];
  
  // Find column indices - support the weekly grid format
  const weekIdx = headers.findIndex(h => h.includes("week"));
  const phaseIdx = headers.findIndex(h => h.includes("phase") || h.includes("difficulty"));
  const dayIdx = headers.findIndex(h => h.includes("day"));
  const typeIdx = headers.findIndex(h => h === "type" || h.includes("workout type"));
  const warmupIdx = headers.findIndex(h => h.includes("warmup") || h.includes("warm up"));
  const workoutIdx = headers.findIndex(h => h === "workout" || h.includes("main workout"));
  const restIdx = headers.findIndex(h => h.includes("rest"));
  const breakupIdx = headers.findIndex(h => h.includes("breakup") || h.includes("break up"));
  const ratesIdx = headers.findIndex(h => h.includes("rate"));
  const cooldownIdx = headers.findIndex(h => h.includes("cooldown") || h.includes("cool down"));
  const notesIdx = headers.findIndex(h => h.includes("note"));
  
  let currentWeek: StandardizedWeek | null = null;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row.some(cell => cell.trim())) continue;
    
    const weekNum = parseInt(row[weekIdx]) || (currentWeek?.week || 1);
    const phase = row[phaseIdx] || currentWeek?.phase || "Training";
    const dayNum = parseInt(row[dayIdx]) || 1;
    
    if (!currentWeek || currentWeek.week !== weekNum) {
      if (currentWeek) weeks.push(currentWeek);
      currentWeek = { 
        week: weekNum, 
        phase, 
        days: [] 
      };
    }
    
    const type = row[typeIdx]?.toUpperCase() || "";
    const warmup = row[warmupIdx] || "";
    const workout = row[workoutIdx] || "";
    const rest = row[restIdx] || "";
    const breakup = row[breakupIdx] || "";
    const rates = row[ratesIdx] || "";
    const cooldown = row[cooldownIdx] || "";
    const notes = row[notesIdx] || "";
    
    // Build description from available fields
    const workoutParts: string[] = [];
    if (warmup) workoutParts.push(`Warmup: ${warmup}`);
    if (workout) workoutParts.push(`Main: ${workout}`);
    if (rest) workoutParts.push(`Rest: ${rest}`);
    if (breakup) workoutParts.push(`Breakup: ${breakup}`);
    if (rates) workoutParts.push(`Rates: ${rates}`);
    if (cooldown) workoutParts.push(`Cooldown: ${cooldown}`);
    
    const description = workoutParts.join(" | ") || workout || "Training day";
    
    const day: StandardizedDay = { day: dayNum };
    
    // Check if this is a strength/lift day
    if (type.includes("LIFT") || type.includes("STRENGTH")) {
      day.strengthWorkout = {
        focus: "Custom Strength",
        exercises: workout ? [{ name: workout }] : [],
        notes: notes || undefined,
      };
    } else {
      // It's an erg/cardio workout
      const zone = ["UT2", "UT1", "TR", "AT"].includes(type) ? type : "Training";
      day.ergWorkout = {
        zone,
        description,
        duration: warmup ? `Warmup: ${warmup}` : undefined,
        notes: notes || undefined,
      };
    }
    
    currentWeek.days.push(day);
  }
  
  if (currentWeek) weeks.push(currentWeek);
  
  return weeks;
};

const generateTemplateCSV = (): string => {
  const headers = [
    "Week", "Phase", "Day", "Date", "Type", "Warmup", "Workout", "Rest", "Breakup", "Rates", "Cooldown", "Notes"
  ];
  
  const sampleRows = [
    ["1", "Easy", "1", "Dec 01", "UT1", "10'", "1k@24 & 6x5'", "1.5'", "2'/2'/1'", "18/20/22", "8'", ""],
    ["1", "Easy", "2", "Dec 02", "LIFT", "", "", "", "", "", "", "Strength day"],
    ["1", "Easy", "3", "Dec 03", "UT2", "8'", "10x6'", "1'", "2'/2'/2'", "16/18/20", "5'", ""],
    ["1", "Easy", "4", "Dec 04", "UT1", "10'", "8x5'", "1.5'", "3'/2'", "", "8'", ""],
    ["1", "Easy", "5", "Dec 05", "LIFT", "", "", "Half", "Day", "", "", "Light lifting"],
    ["2", "Med", "1", "Dec 08", "UT1", "10'", "10x5'", "1.5'", "2'/3'", "vary 18-22", "8'", ""],
  ];
  
  return [headers.join(","), ...sampleRows.map(r => r.join(","))].join("\n");
};

interface SpreadsheetUploadProps {
  teamId?: string;
  onSuccess?: () => void;
}

export const SpreadsheetUpload = ({ teamId, onSuccess }: SpreadsheetUploadProps = {}) => {
  const [fileName, setFileName] = useState<string>("");
  const [planTitle, setPlanTitle] = useState<string>("");
  const [fileType, setFileType] = useState<"csv" | "image" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const uploadPlan = useMutation({
    mutationFn: async (file: File) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      
      // For CSV files, parse directly
      if (fileExt === "csv") {
        const text = await file.text();
        const rows = parseCSV(text);
        
        if (rows.length < 2) {
          throw new Error("File must have at least a header row and one data row");
        }
        
        const workoutData = parseWorkoutData(rows);
        
        if (workoutData.length === 0) {
          throw new Error("Could not parse any workout data from the file");
        }
        
        const { data: newPlan, error } = await supabase.from("workout_plans").insert([{
          user_id: user.id,
          title: planTitle || `Imported Plan - ${new Date().toLocaleDateString()}`,
          description: `Imported from ${file.name}`,
          workout_data: JSON.parse(JSON.stringify(workoutData)) as Json,
        }]).select().single();
        
        if (error) throw error;
        
        // If teamId provided, share with team
        if (teamId && newPlan) {
          await supabase.from("plan_shares").insert({
            plan_id: newPlan.id,
            shared_by: user.id,
            shared_with_team: teamId,
          });
          // Non-blocking email to team members
          const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
          supabase.functions.invoke("send-notification-email", {
            body: {
              type: "training_plan_updated",
              teamId,
              teamName: team?.name ?? undefined,
              senderName: user.email ?? "Your coach",
              planName: newPlan.title,
            },
          }).catch(() => {});
        }

        return workoutData;
      }

      // For PDF/PNG files, use AI to parse the workout structure
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const mimeType = fileExt === 'pdf' ? 'application/pdf' : `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
      const image_base64 = `data:${mimeType};base64,${base64}`;

      // Call edge function to parse with AI
      const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-workout-image", {
        body: { user_id: user.id, image_base64 },
      });

      if (parseError) throw parseError;
      if (parseResult?.error) throw new Error(parseResult.error);

      const workoutData = parseResult?.plan;
      
      if (!workoutData || workoutData.length === 0) {
        throw new Error("Could not extract workout data from the image. Please try a clearer image or use CSV format.");
      }
      
      const { data: newPlan, error } = await supabase.from("workout_plans").insert([{
        user_id: user.id,
        title: planTitle || `Imported Plan - ${new Date().toLocaleDateString()}`,
        description: `Imported from ${file.name} (AI parsed)`,
        workout_data: workoutData as Json,
      }]).select().single();
      
      if (error) throw error;
      
      // If teamId provided, share with team
      if (teamId && newPlan) {
        await supabase.from("plan_shares").insert({
          plan_id: newPlan.id,
          shared_by: user.id,
          shared_with_team: teamId,
        });
        // Non-blocking email to team members
        const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
        supabase.functions.invoke("send-notification-email", {
          body: {
            type: "training_plan_updated",
            teamId,
            teamName: team?.name ?? undefined,
            senderName: user.email ?? "Your coach",
            planName: newPlan.title,
          },
        }).catch(() => {});
      }

      return workoutData;
    },
    onSuccess: (data) => {
      toast({
        title: "Plan Imported",
        description: `Successfully imported ${data.length} weeks of training`,
      });
      setFileName("");
      setPlanTitle("");
      setFileType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
      if (teamId) queryClient.invalidateQueries({ queryKey: ["team-workout-plans", teamId] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!["csv", "pdf", "png", "jpg", "jpeg"].includes(ext || "")) {
        toast({
          title: "Invalid File",
          description: "Please upload a CSV, PDF, or image file (PNG/JPG)",
          variant: "destructive",
        });
        return;
      }
      setFileName(file.name);
      setFileType(ext === "csv" ? "csv" : "image");
    }
  };
  
  const handleUpload = () => {
    const file = fileInputRef.current?.files?.[0];
    if (file) {
      uploadPlan.mutate(file);
    }
  };
  
  const downloadTemplate = () => {
    const csv = generateTemplateCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workout_plan_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Import Custom Plan
        </CardTitle>
        <CardDescription>
          Upload a CSV spreadsheet, PDF, or image of your workout plan
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Download CSV Template
          </Button>
        </div>
        
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><FileSpreadsheet className="h-3 w-3" /> CSV (editable)</span>
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> PDF</span>
          <span className="flex items-center gap-1"><Image className="h-3 w-3" /> PNG/JPG</span>
        </div>
        
        <Input
          placeholder="Plan title (optional)"
          value={planTitle}
          onChange={(e) => setPlanTitle(e.target.value)}
        />
        
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.pdf,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1"
          >
            <Upload className="h-4 w-4 mr-2" />
            {fileName || "Choose File"}
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!fileName || uploadPlan.isPending}
          >
            {uploadPlan.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground">
          {fileType === "csv" 
            ? "CSV columns: Week, Phase, Day, Date, Type, Warmup, Workout, Rest, Breakup, Rates, Cooldown, Notes"
            : "PDF/PNG files will be stored as-is for viewing and printing"}
        </p>
      </CardContent>
    </Card>
  );
};