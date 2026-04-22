import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Camera, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSessionUser } from '@/lib/getUser';

const CATEGORIES = [
  { value: "U16", label: "Under 16" },
  { value: "U18", label: "Under 18" },
  { value: "U23", label: "Under 23" },
  { value: "High School", label: "High School" },
  { value: "Club", label: "Club" },
  { value: "D1", label: "Division 1" },
  { value: "D2", label: "Division 2" },
  { value: "D3", label: "Division 3" },
  { value: "Masters", label: "Masters" },
  { value: "Open", label: "Open" },
];

const DISTANCES = [
  { value: 2000, label: "2K" },
  { value: 5000, label: "5K" },
  { value: 6000, label: "6K" },
];

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const WEIGHT_CLASSES = [
  { value: "open", label: "Open Weight" },
  { value: "lightweight", label: "Lightweight" },
];

export const SubmitVerifiedTime = () => {
  const queryClient = useQueryClient();
  const [distance, setDistance] = useState("");
  const [time, setTime] = useState("");
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [weightClass, setWeightClass] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }
      setScreenshot(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      setIsUploading(true);
      
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      if (!screenshot) throw new Error("Screenshot required");

      // Parse time to interval format (MM:SS.t -> 00:MM:SS.t)
      const timeParts = time.split(":");
      let intervalTime: string;
      if (timeParts.length === 2) {
        const minutes = timeParts[0].padStart(2, "0");
        const seconds = timeParts[1].padStart(4, "0");
        intervalTime = `00:${minutes}:${seconds}`;
      } else {
        throw new Error("Invalid time format. Use MM:SS.t");
      }

      // Upload screenshot
      const fileExt = screenshot.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("verification-screenshots")
        .upload(fileName, screenshot);

      if (uploadError) throw uploadError;

      // Get the URL
      const { data: { publicUrl } } = supabase.storage
        .from("verification-screenshots")
        .getPublicUrl(fileName);

      // Submit verified time
      const { error } = await supabase
        .from("verified_times")
        .insert({
          user_id: user.id,
          distance: parseInt(distance),
          time_achieved: intervalTime,
          screenshot_url: fileName, // Store path, not public URL
          category,
          gender,
          weight_class: weightClass,
          verification_status: "pending",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Time submitted for verification!");
      queryClient.invalidateQueries({ queryKey: ["my-submissions"] });
      // Reset form
      setDistance("");
      setTime("");
      setCategory("");
      setGender("");
      setWeightClass("");
      setScreenshot(null);
      setPreviewUrl(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to submit time");
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!distance || !time || !category || !gender || !weightClass || !screenshot) {
      toast.error("Please fill in all fields and upload a screenshot");
      return;
    }

    submitMutation.mutate();
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          Submit Time for Verification
        </CardTitle>
        <CardDescription>
          Submit your erg time with a screenshot of your PM5/PM3 display for verification
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your screenshot must clearly show the final time, distance, and date from your erg monitor.
              Times are manually reviewed before appearing on the leaderboard.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Distance *</Label>
              <Select value={distance} onValueChange={setDistance}>
                <SelectTrigger>
                  <SelectValue placeholder="Select distance" />
                </SelectTrigger>
                <SelectContent>
                  {DISTANCES.map(d => (
                    <SelectItem key={d.value} value={d.value.toString()}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Time *</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g., 7:05.2"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Gender *</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map(g => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Weight Class *</Label>
              <Select value={weightClass} onValueChange={setWeightClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Select weight class" />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHT_CLASSES.map(w => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Screenshot Upload */}
          <div className="space-y-2">
            <Label>Screenshot of Erg Display *</Label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
              {previewUrl ? (
                <div className="space-y-4">
                  <img 
                    src={previewUrl} 
                    alt="Screenshot preview" 
                    className="max-h-48 mx-auto rounded-lg"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setScreenshot(null);
                      setPreviewUrl(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG up to 5MB
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full"
            disabled={isUploading || submitMutation.isPending}
          >
            {isUploading || submitMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Submit for Verification
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
