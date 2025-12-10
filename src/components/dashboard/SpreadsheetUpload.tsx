import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2, Download } from "lucide-react";

interface WorkoutDay {
  day: number;
  ergWorkout: {
    zone: string;
    description: string;
    duration?: string;
    distance?: number;
    targetSplit?: string;
    rate?: string;
    notes?: string;
  };
  strengthWorkout: {
    focus: string;
    exercises: {
      exercise: string;
      sets: number;
      reps: number;
      weight?: string;
      notes?: string;
    }[];
  };
  mealPlan: {
    breakfast: string;
    lunch: string;
    dinner: string;
    snacks: string;
    totalCalories?: number;
    macros?: string;
  };
}

interface WorkoutWeek {
  week: number;
  phase: string;
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
  
  // Find column indices
  const weekIdx = headers.findIndex(h => h.includes("week"));
  const phaseIdx = headers.findIndex(h => h.includes("phase"));
  const dayIdx = headers.findIndex(h => h.includes("day"));
  const zoneIdx = headers.findIndex(h => h.includes("zone"));
  const ergDescIdx = headers.findIndex(h => h.includes("erg") && h.includes("description") || h === "erg workout");
  const durationIdx = headers.findIndex(h => h.includes("duration"));
  const distanceIdx = headers.findIndex(h => h.includes("distance"));
  const splitIdx = headers.findIndex(h => h.includes("split") || h.includes("pace"));
  const rateIdx = headers.findIndex(h => h.includes("rate") || h.includes("spm"));
  const strengthFocusIdx = headers.findIndex(h => h.includes("strength") && h.includes("focus") || h === "strength focus");
  const exercisesIdx = headers.findIndex(h => h.includes("exercise"));
  const breakfastIdx = headers.findIndex(h => h.includes("breakfast"));
  const lunchIdx = headers.findIndex(h => h.includes("lunch"));
  const dinnerIdx = headers.findIndex(h => h.includes("dinner"));
  const snacksIdx = headers.findIndex(h => h.includes("snack"));
  const caloriesIdx = headers.findIndex(h => h.includes("calorie"));
  
  let currentWeek: WorkoutWeek | null = null;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || !row.some(cell => cell.trim())) continue;
    
    const weekNum = parseInt(row[weekIdx]) || (currentWeek?.week || 1);
    const phase = row[phaseIdx] || currentWeek?.phase || "Training";
    const dayNum = parseInt(row[dayIdx]) || 1;
    
    if (!currentWeek || currentWeek.week !== weekNum) {
      if (currentWeek) weeks.push(currentWeek);
      currentWeek = { week: weekNum, phase, days: [] };
    }
    
    // Parse exercises (format: "Exercise 3x10 @weight; Exercise2 4x8")
    const exercisesStr = row[exercisesIdx] || "";
    const exercises = exercisesStr.split(";").filter(e => e.trim()).map(ex => {
      const match = ex.trim().match(/^(.+?)\s*(\d+)x(\d+)\s*(?:@(.+))?$/);
      if (match) {
        return {
          exercise: match[1].trim(),
          sets: parseInt(match[2]),
          reps: parseInt(match[3]),
          weight: match[4]?.trim(),
        };
      }
      return { exercise: ex.trim(), sets: 3, reps: 10 };
    });
    
    const day: WorkoutDay = {
      day: dayNum,
      ergWorkout: {
        zone: row[zoneIdx] || "UT2",
        description: row[ergDescIdx] || "Steady state",
        duration: row[durationIdx],
        distance: parseInt(row[distanceIdx]) || undefined,
        targetSplit: row[splitIdx],
        rate: row[rateIdx],
      },
      strengthWorkout: {
        focus: row[strengthFocusIdx] || "Full Body",
        exercises,
      },
      mealPlan: {
        breakfast: row[breakfastIdx] || "",
        lunch: row[lunchIdx] || "",
        dinner: row[dinnerIdx] || "",
        snacks: row[snacksIdx] || "",
        totalCalories: parseInt(row[caloriesIdx]) || undefined,
      },
    };
    
    currentWeek.days.push(day);
  }
  
  if (currentWeek) weeks.push(currentWeek);
  
  return weeks;
};

const generateTemplateCSV = (): string => {
  const headers = [
    "Week", "Phase", "Day", "Zone", "Erg Description", "Duration", "Distance", 
    "Target Split", "Rate", "Strength Focus", "Exercises", 
    "Breakfast", "Lunch", "Dinner", "Snacks", "Calories"
  ];
  
  const sampleRows = [
    ["1", "Base", "1", "UT2", "Steady state rowing", "45 min", "10000", "2:10", "18-20", "Core & Legs", "Squats 3x10 @135lbs; Planks 3x60s; Leg Press 3x12 @200lbs", "Oatmeal with berries", "Grilled chicken salad", "Salmon with quinoa", "Greek yogurt, almonds", "2500"],
    ["1", "Base", "2", "UT1", "Intervals 8x500m", "40 min", "4000", "1:55", "26-28", "Upper Body", "Bench Press 4x8 @155lbs; Rows 4x10 @135lbs; Pull-ups 3x8", "Eggs with toast", "Turkey wrap", "Steak with vegetables", "Protein shake", "2600"],
    ["1", "Base", "3", "UT2", "Long steady piece", "60 min", "12000", "2:15", "16-18", "Full Body", "Deadlifts 3x8 @185lbs; Shoulder Press 3x10 @95lbs", "Smoothie bowl", "Tuna sandwich", "Pasta with meatballs", "Fruit and nuts", "2700"],
  ];
  
  return [headers.join(","), ...sampleRows.map(r => r.join(","))].join("\n");
};

export const SpreadsheetUpload = () => {
  const [fileName, setFileName] = useState<string>("");
  const [planTitle, setPlanTitle] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const uploadPlan = useMutation({
    mutationFn: async (file: File) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
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
    },
    onSuccess: (data) => {
      toast({
        title: "Plan Imported",
        description: `Successfully imported ${data.length} weeks of training`,
      });
      setFileName("");
      setPlanTitle("");
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
      if (!file.name.endsWith(".csv")) {
        toast({
          title: "Invalid File",
          description: "Please upload a CSV file",
          variant: "destructive",
        });
        return;
      }
      setFileName(file.name);
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
          Upload a CSV spreadsheet with your own workout plan
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Download Template
        </Button>
        
        <Input
          placeholder="Plan title (optional)"
          value={planTitle}
          onChange={(e) => setPlanTitle(e.target.value)}
        />
        
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1"
          >
            <Upload className="h-4 w-4 mr-2" />
            {fileName || "Choose CSV File"}
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
          Required columns: Week, Day, Zone, Erg Description. Optional: Phase, Duration, Distance, Split, Rate, Strength Focus, Exercises, Meals.
        </p>
      </CardContent>
    </Card>
  );
};
