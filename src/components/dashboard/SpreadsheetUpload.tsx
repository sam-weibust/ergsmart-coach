import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2, Download, Image, FileText } from "lucide-react";

interface WorkoutDay {
  day: number;
  type?: string;
  warmup?: string;
  workout?: string;
  rest?: string;
  breakup?: string;
  rates?: string;
  cooldown?: string;
  notes?: string;
}

interface WorkoutWeek {
  week: number;
  phase: string;
  startDate?: string;
  days: WorkoutDay[];
}

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

const parseWorkoutData = (rows: string[][]): WorkoutWeek[] => {
  const weeks: WorkoutWeek[] = [];
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
  const dateIdx = headers.findIndex(h => h.includes("date"));
  
  let currentWeek: WorkoutWeek | null = null;
  
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
        startDate: row[dateIdx] || undefined,
        days: [] 
      };
    }
    
    const day: WorkoutDay = {
      day: dayNum,
      type: row[typeIdx] || undefined,
      warmup: row[warmupIdx] || undefined,
      workout: row[workoutIdx] || undefined,
      rest: row[restIdx] || undefined,
      breakup: row[breakupIdx] || undefined,
      rates: row[ratesIdx] || undefined,
      cooldown: row[cooldownIdx] || undefined,
      notes: row[notesIdx] || undefined,
    };
    
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

export const SpreadsheetUpload = () => {
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
      
      // For CSV files, parse directly
      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseCSV(text);
        
        if (rows.length < 2) {
          throw new Error("File must have at least a header row and one data row");
        }
        
        const workoutData = parseWorkoutData(rows);
        
        if (workoutData.length === 0) {
          throw new Error("Could not parse any workout data from the file");
        }
        
        const { error } = await supabase.from("workout_plans").insert([{
          user_id: user.id,
          title: planTitle || `Imported Plan - ${new Date().toLocaleDateString()}`,
          description: `Imported from ${file.name}`,
          workout_data: workoutData as any,
        }]);
        
        if (error) throw error;
        
        return workoutData;
      }
      
      // For PDF/PNG files, upload to storage and create a reference
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const filePath = `${user.id}/plans/${Date.now()}.${fileExt}`;
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("workout-plans")
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from("workout-plans")
        .getPublicUrl(filePath);
      
      // Store as a workout plan with file reference
      const workoutData = [{
        week: 1,
        phase: "Uploaded Plan",
        fileUrl: urlData.publicUrl,
        fileName: file.name,
        fileType: fileExt,
        days: []
      }];
      
      const { error } = await supabase.from("workout_plans").insert([{
        user_id: user.id,
        title: planTitle || `Uploaded Plan - ${new Date().toLocaleDateString()}`,
        description: `Uploaded from ${file.name}`,
        workout_data: workoutData as any,
      }]);
      
      if (error) throw error;
      
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