import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput } from "@/components/ui/TimeInput";
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

  // Role — drives which fields show
  const [role, setRole] = useState<"athlete" | "coxswain" | "coach" | "organizer">("athlete");

  // Shared fields (all roles)
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Athlete + coxswain shared
  const [school, setSchool] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [clubTeam, setClubTeam] = useState("");
  const [location, setLocation] = useState("");

  // Athlete-only fields
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [sidePreference, setSidePreference] = useState("");
  const [experience, setExperience] = useState("");
  const [goals, setGoals] = useState("");
  const [healthIssues, setHealthIssues] = useState("");
  const [current2k, setCurrent2k] = useState("");
  const [goal2k, setGoal2k] = useState("");
  const [best2kDisplay, setBest2kDisplay] = useState("");
  const [best6kDisplay, setBest6kDisplay] = useState("");
  const [yearsRowing, setYearsRowing] = useState("");
  const [enableStrengthTraining, setEnableStrengthTraining] = useState(true);
  const [enableMealPlans, setEnableMealPlans] = useState(true);
  const [dietGoal, setDietGoal] = useState("maintain");
  const [allergies, setAllergies] = useState("");
  const [age, setAge] = useState("");

  // Coxswain-specific fields
  const [coxWeightLbs, setCoxWeightLbs] = useState("");
  const [coxExperience, setCoxExperience] = useState("");
  const [coxSteeringPref, setCoxSteeringPref] = useState("");
  const [coxVoiceLevel, setCoxVoiceLevel] = useState("");
  const [coxYears, setCoxYears] = useState("");
  const [coxNotes, setCoxNotes] = useState("");

  // Coach-only fields
  const [coachCity, setCoachCity] = useState("");
  const [coachState, setCoachState] = useState("");
  const [yearsCoaching, setYearsCoaching] = useState("");
  const [coachingLevel, setCoachingLevel] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Organizer-only fields
  const [orgOrgName, setOrgOrgName] = useState("");
  const [orgTitle, setOrgTitle] = useState("");

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
    // Derive role: prefer new role column, fall back to legacy fields
    const p = profile as any;
    const derivedRole: "athlete" | "coxswain" | "coach" | "organizer" =
      p.role === "organizer" ? "organizer"
      : p.role === "coxswain" ? "coxswain"
      : p.role === "coach" ? "coach"
      : p.is_coxswain ? "coxswain"
      : p.user_type === "coach" ? "coach"
      : "athlete";
    setRole(derivedRole);

    setFullName(p.full_name || "");
    setUsername(p.username || "");
    setAge((p.age || "").toString());
    setGoals(p.goals || "");
    setHealthIssues((p.health_issues || []).join(", "));
    setEnableStrengthTraining(p.enable_strength_training !== false);
    setEnableMealPlans(p.enable_meal_plans !== false);
    setDietGoal(p.diet_goal || "maintain");
    setAllergies((p.allergies || []).join(", "));
    setExperience(p.experience_level || "");
    setSidePreference(p.side_preference || "");

    if (p.weight) setWeightLbs(kgToLbs(p.weight).toString());
    if (p.height) {
      const { feet, inches } = cmToFeetInches(p.height);
      setHeightFeet(feet.toString());
      setHeightInches(inches.toString());
    }

    if (p.best_2k_seconds) {
      const s = p.best_2k_seconds;
      setBest2kDisplay(`${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
    }
    if (p.best_6k_seconds) {
      const s = p.best_6k_seconds;
      setBest6kDisplay(`${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
    }
    setYearsRowing((p.years_rowing || "").toString());

    // Coxswain fields
    setCoxWeightLbs((p.cox_weight_lbs || "").toString());
    setCoxExperience(p.cox_experience || "");
    setCoxSteeringPref(p.cox_steering_pref || "");
    setCoxVoiceLevel((p.cox_voice_level || "").toString());
    setCoxYears((p.cox_years_coxing || "").toString());
    setCoxNotes(p.cox_notes || "");

    // Coach fields
    setCoachCity(p.coach_city || "");
    setCoachState(p.coach_state || "");
    setYearsCoaching((p.years_coaching || "").toString());
    setCoachingLevel(p.coaching_level || "");
    setContactPhone(p.contact_phone || "");

    // Organizer fields
    setOrgOrgName(p.org_name || "");
    setOrgTitle(p.org_title || "");
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
      const heightCm = (role === "athlete" && (heightFeet || heightInches))
        ? feetInchesToCm(parseFloat(heightFeet) || 0, parseFloat(heightInches) || 0)
        : null;

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id,
        role,
        // Keep legacy fields in sync for backwards compat
        user_type: role === "coach" || role === "organizer" ? "coach" : "rower",
        is_coxswain: role === "coxswain",
        full_name: fullName || null,
        username: username || null,
        weight: weightKg,
        height: heightCm,
        updated_at: new Date().toISOString(),
        // Athlete-only
        ...(role === "athlete" ? {
          experience_level: experience || null,
          goals: goals || null,
          diet_goal: dietGoal,
          enable_strength_training: enableStrengthTraining,
          enable_meal_plans: enableMealPlans,
          allergies: allergies ? allergies.split(",").map((a) => a.trim()).filter(Boolean) : [],
          age: age ? parseInt(age) : null,
          health_issues: healthIssues ? healthIssues.split(",").map((h) => h.trim()).filter(Boolean) : [],
          side_preference: sidePreference || null,
          years_rowing: yearsRowing ? parseInt(yearsRowing) : null,
          best_2k_seconds: best2kDisplay ? (() => { const p = best2kDisplay.split(":"); return p.length === 2 ? parseInt(p[0]) * 60 + parseFloat(p[1]) : null; })() : null,
          best_6k_seconds: best6kDisplay ? (() => { const p = best6kDisplay.split(":"); return p.length === 2 ? parseInt(p[0]) * 60 + parseFloat(p[1]) : null; })() : null,
          // Clear coxswain + coach fields
          cox_weight_lbs: null, cox_experience: null, cox_steering_pref: null,
          cox_voice_level: null, cox_years_coxing: null, cox_notes: null,
          coach_city: null, coach_state: null, years_coaching: null, coaching_level: null, contact_phone: null,
        } : {}),
        // Coxswain-only
        ...(role === "coxswain" ? {
          cox_weight_lbs: coxWeightLbs ? parseFloat(coxWeightLbs) : null,
          cox_experience: coxExperience || null,
          cox_steering_pref: coxSteeringPref || null,
          cox_voice_level: coxVoiceLevel ? parseInt(coxVoiceLevel) : null,
          cox_years_coxing: coxYears ? parseInt(coxYears) : null,
          cox_notes: coxNotes || null,
          // Clear athlete + coach fields
          experience_level: null, goals: null, diet_goal: null,
          enable_strength_training: false, enable_meal_plans: false,
          side_preference: null, years_rowing: null, best_2k_seconds: null, best_6k_seconds: null,
          coach_city: null, coach_state: null, years_coaching: null, coaching_level: null, contact_phone: null,
        } : {}),
        // Coach-only
        ...(role === "coach" ? {
          coach_city: coachCity || null,
          coach_state: coachState || null,
          years_coaching: yearsCoaching ? parseInt(yearsCoaching) : null,
          coaching_level: coachingLevel || null,
          contact_phone: contactPhone || null,
          // Clear athlete + coxswain fields
          weight: null, height: null, experience_level: null, goals: null, diet_goal: null,
          enable_strength_training: false, enable_meal_plans: false,
          side_preference: null, years_rowing: null, best_2k_seconds: null, best_6k_seconds: null,
          cox_weight_lbs: null, cox_experience: null, cox_steering_pref: null,
          cox_voice_level: null, cox_years_coxing: null, cox_notes: null,
        } : {}),
        // Organizer-only
        ...(role === "organizer" ? {
          org_name: orgOrgName || null,
          org_title: orgTitle || null,
          contact_phone: contactPhone || null,
          // Clear athlete/cox/coach fields
          weight: null, height: null, experience_level: null, goals: null, diet_goal: null,
          enable_strength_training: false, enable_meal_plans: false,
          side_preference: null, years_rowing: null, best_2k_seconds: null, best_6k_seconds: null,
          cox_weight_lbs: null, cox_experience: null, cox_steering_pref: null,
          cox_voice_level: null, cox_years_coxing: null, cox_notes: null,
          coach_city: null, coach_state: null, years_coaching: null, coaching_level: null,
        } : {}),
      } as any, { onConflict: "id" });

      console.log("[ProfileSave] role:", role, "error:", profileError);
      if (profileError) throw profileError;

      // athlete_profiles stores public profile for athletes + coxswains
      if (role !== "coach" && role !== "organizer") {
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

        await supabase.from("user_goals").upsert({
          user_id: user.id,
          current_2k_time: role === "athlete" ? parseTimeToInterval(current2k) : null,
          goal_2k_time: role === "athlete" ? parseTimeToInterval(goal2k) : null,
        } as any);
      } else {
        // Coach + Organizer use athlete_profiles for bio/photo storage
        await supabase.from("athlete_profiles").upsert({
          user_id: user.id,
          bio,
          school: role === "organizer" ? (orgOrgName || null) : school,
          location: role === "organizer" ? location : `${coachCity}${coachCity && coachState ? ", " : ""}${coachState}`,
          contact_email: contactEmail,
          is_public: isPublic,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    },
    onSuccess: () => {
      toast({ title: "Profile saved" });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["user-goals-profile"] });
      queryClient.invalidateQueries({ queryKey: ["user-goals"] });
      queryClient.invalidateQueries({ queryKey: ["athlete-profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile-cox-check"] });
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
              <p className="text-xs text-muted-foreground">{school || (role === "coach" ? coachCity || "Add your location" : "Add your school")}</p>
            </div>
          </div>

          {/* Role selector */}
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
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="athlete">Athlete</SelectItem>
                    <SelectItem value="coxswain">Coxswain</SelectItem>
                    <SelectItem value="coach">Coach</SelectItem>
                    <SelectItem value="organizer">Organizer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── ATHLETE FIELDS ── */}
          {role === "athlete" && (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground border-b pb-1">Athlete Info</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Age</Label>
                    <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="18" min="10" max="120" />
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
                  <div className="space-y-1">
                    <Label className="text-xs">Side Preference</Label>
                    <Select value={sidePreference} onValueChange={setSidePreference}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="port">Port</SelectItem>
                        <SelectItem value="starboard">Starboard</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Experience Level</Label>
                    <Select value={experience} onValueChange={setExperience}>
                      <SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="novice">Novice</SelectItem>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="elite">Elite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Seasons Rowing</Label>
                    <Input type="number" value={yearsRowing} onChange={e => setYearsRowing(e.target.value)} placeholder="e.g. 6 for 3 years of fall and spring" min="0" max="60" />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground border-b pb-1">Erg Times</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Current 2K (M:SS)</Label>
                    <TimeInput value={current2k} onChange={setCurrent2k} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Goal 2K (M:SS)</Label>
                    <TimeInput value={goal2k} onChange={setGoal2k} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Best 2K (M:SS)</Label>
                    <Input value={best2kDisplay} onChange={e => setBest2kDisplay(e.target.value)} placeholder="7:15" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Best 6K (M:SS)</Label>
                    <Input value={best6kDisplay} onChange={e => setBest6kDisplay(e.target.value)} placeholder="23:30" />
                  </div>
                </div>
              </div>

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
            </>
          )}

          {/* ── COXSWAIN FIELDS ── */}
          {role === "coxswain" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground border-b pb-1">Coxswain Info</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Weight (lbs)</Label>
                  <Input type="number" value={coxWeightLbs || weightLbs} onChange={e => { setCoxWeightLbs(e.target.value); setWeightLbs(e.target.value); }} placeholder="120" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Experience Level</Label>
                  <Select value={coxExperience} onValueChange={setCoxExperience}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="novice">Novice</SelectItem>
                      <SelectItem value="jv">JV</SelectItem>
                      <SelectItem value="varsity">Varsity</SelectItem>
                      <SelectItem value="collegiate">Collegiate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Steering Preference</Label>
                  <Select value={coxSteeringPref} onValueChange={setCoxSteeringPref}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="port">Port</SelectItem>
                      <SelectItem value="starboard">Starboard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Voice Level (1–5)</Label>
                  <Select value={coxVoiceLevel} onValueChange={setCoxVoiceLevel}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Seasons Coxing</Label>
                  <Input type="number" value={coxYears} onChange={e => setCoxYears(e.target.value)} placeholder="2" min="0" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Notes (coach-visible)</Label>
                  <Textarea value={coxNotes} onChange={e => setCoxNotes(e.target.value)} placeholder="Notes for coaches..." rows={2} maxLength={500} />
                </div>
              </div>
            </div>
          )}

          {/* ── COACH FIELDS ── */}
          {role === "coach" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground border-b pb-1">Coaching Info</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Program / School</Label>
                  <Input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Lincoln High School" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">City</Label>
                  <Input value={coachCity} onChange={(e) => setCoachCity(e.target.value)} placeholder="Washington" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">State</Label>
                  <Input value={coachState} onChange={(e) => setCoachState(e.target.value)} placeholder="DC" maxLength={2} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Years Coaching</Label>
                  <Input type="number" value={yearsCoaching} onChange={(e) => setYearsCoaching(e.target.value)} placeholder="5" min="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Coaching Level</Label>
                  <Select value={coachingLevel} onValueChange={setCoachingLevel}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high_school">High School</SelectItem>
                      <SelectItem value="club">Club</SelectItem>
                      <SelectItem value="collegiate">Collegiate</SelectItem>
                      <SelectItem value="masters">Masters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contact Email</Label>
                  <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="coach@program.edu" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contact Phone (optional)</Label>
                  <Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="555-555-5555" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Bio</Label>
                  <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Your coaching background and philosophy..." rows={3} maxLength={500} />
                </div>
              </div>
            </div>
          )}

          {/* ── ORGANIZER FIELDS ── */}
          {role === "organizer" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground border-b pb-1">Organizer Info</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Organization Name</Label>
                  <Input value={orgOrgName} onChange={(e) => setOrgOrgName(e.target.value)} placeholder="e.g., CRI Rowing" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Title / Position</Label>
                  <Input value={orgTitle} onChange={(e) => setOrgTitle(e.target.value)} placeholder="e.g., Program Director, Athletic Director" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contact Email</Label>
                  <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="director@program.org" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contact Phone</Label>
                  <Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="555-555-5555" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Washington, DC" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Bio</Label>
                  <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Your background and role..." rows={3} maxLength={500} />
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <Label className="text-xs text-muted-foreground">Public profile</Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{isPublic ? "Public" : "Private"}</span>
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </div>
              </div>
            </div>
          )}

          {/* Public profile — athlete + coxswain */}
          {role !== "coach" && role !== "organizer" && (
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
                  <Label className="text-xs">Personal Statement</Label>
                  <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio about your rowing journey..." rows={2} maxLength={500} />
                </div>
              </div>
            </div>
          )}

          {/* Coach public visibility */}
          {role === "coach" && role !== "organizer" && (
            <div className="flex items-center justify-between border-t pt-3">
              <Label className="text-xs text-muted-foreground">Public profile</Label>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{isPublic ? "Public" : "Private"}</span>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </div>
          )}
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
