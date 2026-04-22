import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, User, Save } from "lucide-react";
import { getSessionUser } from '@/lib/getUser';

const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
const lbsToKg = (lbs: number) => lbs / 2.20462;
const cmToFeetInches = (cm: number) => {
  const totalInches = cm / 2.54;
  return { feet: Math.floor(totalInches / 12), inches: Math.round(totalInches % 12) };
};
const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * 2.54;

const parseTimeToInterval = (time: string) => {
  if (!time) return null;
  const parts = time.split(":");
  if (parts.length !== 2) return null;
  const minutes = parseInt(parts[0]);
  const seconds = parseFloat(parts[1]);
  if (isNaN(minutes) || isNaN(seconds)) return null;
  return `00:${minutes.toString().padStart(2, "0")}:${Math.floor(seconds).toString().padStart(2, "0")}`;
};

const formatInterval = (interval: unknown) => {
  if (!interval) return "";
  const str = String(interval);
  const match = str.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, hours, minutes, seconds] = match;
    return `${parseInt(hours) * 60 + parseInt(minutes)}:${seconds}`;
  }
  return str;
};

interface ProfileEditPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileEditPanel({ open, onClose }: ProfileEditPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Basic profile fields
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [userType, setUserType] = useState("rower");
  const [experience, setExperience] = useState("");
  const [age, setAge] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [goals, setGoals] = useState("");
  const [healthIssues, setHealthIssues] = useState("");
  const [current2k, setCurrent2k] = useState("");
  const [goal2k, setGoal2k] = useState("");
  const [enableStrengthTraining, setEnableStrengthTraining] = useState(true);
  const [enableMealPlans, setEnableMealPlans] = useState(true);
  const [dietGoal, setDietGoal] = useState("maintain");
  const [allergies, setAllergies] = useState("");

  // Public profile fields
  const [bio, setBio] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [school, setSchool] = useState("");
  const [clubTeam, setClubTeam] = useState("");
  const [location, setLocation] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: open,
  });

  const { data: userGoals } = useQuery({
    queryKey: ["user-goals-profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("user_goals").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: open,
  });

  const { data: ap } = useQuery({
    queryKey: ["athlete-profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: open,
  });

  useEffect(() => {
    if (!profile) return;
    if (profile.weight) setWeightLbs(kgToLbs(profile.weight).toString());
    if (profile.height) {
      const { feet, inches } = cmToFeetInches(profile.height);
      setHeightFeet(feet.toString());
      setHeightInches(inches.toString());
    }
    setFullName((profile as any).full_name || "");
    setUsername((profile as any).username || "");
    setUserType((profile as any).user_type || "rower");
    setExperience((profile as any).experience_level || "");
    setAge(((profile as any).age || "").toString());
    setGoals((profile as any).goals || "");
    setHealthIssues(((profile as any).health_issues || []).join(", "));
    setEnableStrengthTraining((profile as any).enable_strength_training !== false);
    setEnableMealPlans((profile as any).enable_meal_plans !== false);
    setDietGoal((profile as any).diet_goal || "maintain");
    setAllergies(((profile as any).allergies || []).join(", "));
  }, [profile]);

  useEffect(() => {
    if (!userGoals) return;
    setCurrent2k(formatInterval(userGoals.current_2k_time));
    setGoal2k(formatInterval(userGoals.goal_2k_time));
  }, [userGoals]);

  useEffect(() => {
    if (!ap) return;
    setBio(ap.bio || "");
    setGradYear(ap.grad_year ? String(ap.grad_year) : "");
    setSchool(ap.school || "");
    setClubTeam(ap.club_team || "");
    setLocation(ap.location || "");
    setContactEmail(ap.contact_email || "");
    setIsPublic(ap.is_public || false);
  }, [ap]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not authenticated");

      const weightKg = weightLbs ? lbsToKg(parseFloat(weightLbs)) : null;
      const heightCm = heightFeet || heightInches
        ? feetInchesToCm(parseFloat(heightFeet) || 0, parseFloat(heightInches) || 0)
        : null;

      await supabase.from("profiles").upsert({
        id: user.id,
        weight: weightKg,
        height: heightCm,
        experience_level: experience || null,
        goals: goals || null,
        full_name: fullName || null,
        username: username || null,
        user_type: userType,
        diet_goal: dietGoal,
        enable_strength_training: enableStrengthTraining,
        enable_meal_plans: enableMealPlans,
        allergies: allergies ? allergies.split(",").map((a) => a.trim()).filter(Boolean) : [],
        age: age ? parseInt(age) : null,
        health_issues: healthIssues ? healthIssues.split(",").map((h) => h.trim()).filter(Boolean) : [],
        updated_at: new Date().toISOString(),
      } as any);

      await supabase.from("user_goals").upsert({
        user_id: user.id,
        current_2k_time: parseTimeToInterval(current2k),
        goal_2k_time: parseTimeToInterval(goal2k),
      } as any);

      await supabase.from("athlete_profiles").upsert({
        user_id: user.id,
        bio,
        grad_year: gradYear ? parseInt(gradYear) : null,
        school,
        club_team: clubTeam,
        location,
        contact_email: contactEmail,
        is_public: isPublic,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    },
    onSuccess: () => {
      toast({ title: "Profile saved" });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["user-goals-profile"] });
      queryClient.invalidateQueries({ queryKey: ["user-goals"] });
      queryClient.invalidateQueries({ queryKey: ["athlete-profile"] });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const uploadAvatar = async (file: File) => {
    const user = await getSessionUser();
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("athlete_profiles").upsert({ user_id: user.id, avatar_url: publicUrl }, { onConflict: "user_id" });
      queryClient.invalidateQueries({ queryKey: ["athlete-profile"] });
      toast({ title: "Photo uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const initials = (fullName || username || "A").charAt(0).toUpperCase();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Edit Profile
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src={ap?.avatar_url} />
                <AvatarFallback className="text-xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1 shadow hover:bg-primary/90 transition-colors"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadAvatar(e.target.files[0]); }} />
            <div>
              <p className="font-semibold">{fullName || "Set your name"}</p>
              <p className="text-xs text-muted-foreground">{school || "Add your school"}</p>
            </div>
          </div>

          {/* Basic info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Basic Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Full Name</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Username</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="unique_handle" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Select value={userType} onValueChange={setUserType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rower">Rower</SelectItem>
                    <SelectItem value="coach">Coach</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Age</Label>
                <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="18" min="10" max="120" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Experience</Label>
                <Select value={experience} onValueChange={setExperience}>
                  <SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                    <SelectItem value="elite">Elite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Weight (lbs)</Label>
                <Input type="number" value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} placeholder="165" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Height</Label>
                <div className="flex gap-1.5">
                  <Input type="number" value={heightFeet} onChange={(e) => setHeightFeet(e.target.value)} placeholder="6" min="3" max="8" />
                  <span className="text-xs text-muted-foreground self-center">ft</span>
                  <Input type="number" value={heightInches} onChange={(e) => setHeightInches(e.target.value)} placeholder="1" min="0" max="11" />
                  <span className="text-xs text-muted-foreground self-center">in</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2K Times */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">2K Times</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Current 2K (M:SS)</Label>
                <Input value={current2k} onChange={(e) => setCurrent2k(e.target.value)} placeholder="7:30" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Goal 2K (M:SS)</Label>
                <Input value={goal2k} onChange={(e) => setGoal2k(e.target.value)} placeholder="7:00" />
              </div>
            </div>
          </div>

          {/* Public Profile */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-1">
              <h3 className="text-sm font-semibold text-foreground">Public Profile</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{isPublic ? "Public" : "Private"}</span>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Grad Year</Label>
                <Input type="number" value={gradYear} onChange={(e) => setGradYear(e.target.value)} placeholder="2026" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contact Email</Label>
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="athlete@email.com" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">School</Label>
                <Input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Lincoln High School" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Club Team</Label>
                <Input value={clubTeam} onChange={(e) => setClubTeam(e.target.value)} placeholder="Capital Crew" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Washington, DC" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Bio</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio about your rowing journey..." rows={2} maxLength={500} />
              </div>
            </div>
          </div>

          {/* Training Goals */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground border-b pb-1">Training</h3>
            <div className="space-y-1">
              <Label className="text-xs">Goals</Label>
              <Textarea value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g., Improve 2K to sub-7:00, build endurance..." rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Health Issues / Injuries</Label>
              <Input value={healthIssues} onChange={(e) => setHealthIssues(e.target.value)} placeholder="e.g., bad knees, shoulder injury" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Strength Training</Label>
              <Switch checked={enableStrengthTraining} onCheckedChange={setEnableStrengthTraining} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Meal Plans</Label>
              <Switch checked={enableMealPlans} onCheckedChange={setEnableMealPlans} />
            </div>
            {enableMealPlans && (
              <div className="space-y-1">
                <Label className="text-xs">Diet Goal</Label>
                <Select value={dietGoal} onValueChange={setDietGoal}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cut">Cut (Lose Fat)</SelectItem>
                    <SelectItem value="maintain">Maintain</SelectItem>
                    <SelectItem value="bulk">Bulk (Build Muscle)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full gap-2">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Profile
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
