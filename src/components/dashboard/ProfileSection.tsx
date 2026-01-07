import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User } from "lucide-react";
import { NotificationSettings } from "./NotificationSettings";

// Imperial conversion helpers
const kgToLbs = (kg: number) => Math.round(kg * 2.20462);
const lbsToKg = (lbs: number) => lbs / 2.20462;
const cmToFeetInches = (cm: number) => {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
};
const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * 2.54;

export const ProfileSection = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [weightLbs, setWeightLbs] = useState("");
  const [heightFeet, setHeightFeet] = useState("");
  const [heightInches, setHeightInches] = useState("");
  const [experience, setExperience] = useState("");
  const [goals, setGoals] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [userType, setUserType] = useState("rower");
  const [dietGoal, setDietGoal] = useState("maintain");
  const [enableStrengthTraining, setEnableStrengthTraining] = useState(true);
  const [enableMealPlans, setEnableMealPlans] = useState(true);
  const [allergies, setAllergies] = useState("");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      // Convert stored kg to display lbs
      if (profile.weight) {
        setWeightLbs(kgToLbs(profile.weight).toString());
      }
      // Convert stored cm to display feet/inches
      if (profile.height) {
        const { feet, inches } = cmToFeetInches(profile.height);
        setHeightFeet(feet.toString());
        setHeightInches(inches.toString());
      }
      setExperience(profile.experience_level || "");
      setGoals(profile.goals || "");
      setFullName(profile.full_name || "");
      setUsername((profile as any).username || "");
      setUserType((profile as any).user_type || "rower");
      setDietGoal((profile as any).diet_goal || "maintain");
      setEnableStrengthTraining((profile as any).enable_strength_training !== false);
      setEnableMealPlans((profile as any).enable_meal_plans !== false);
      setAllergies(((profile as any).allergies || []).join(", "));
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Convert imperial input to metric for storage
      const weightKg = weightLbs ? lbsToKg(parseFloat(weightLbs)) : null;
      const heightCm = heightFeet || heightInches 
        ? feetInchesToCm(parseFloat(heightFeet) || 0, parseFloat(heightInches) || 0) 
        : null;

      const { error } = await supabase
        .from("profiles")
        .upsert({
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
          allergies: allergies ? allergies.split(",").map(a => a.trim()).filter(Boolean) : [],
          updated_at: new Date().toISOString(),
        } as any);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your settings have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Settings
          </CardTitle>
          <CardDescription>
            Set your details for personalized workout plans
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProfile.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="userType">I am a...</Label>
                <Select value={userType} onValueChange={setUserType}>
                  <SelectTrigger id="userType">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rower">Rower / Athlete</SelectItem>
                    <SelectItem value="coach">Coach</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {userType === "coach" ? "Coaches can create teams and share plans" : "Rowers get personalized training plans"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="unique_username"
                />
                <p className="text-xs text-muted-foreground">Friends can find you by this username</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="experience">Experience Level</Label>
                <Select value={experience} onValueChange={setExperience}>
                  <SelectTrigger id="experience">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner (0-1 years)</SelectItem>
                    <SelectItem value="intermediate">Intermediate (1-3 years)</SelectItem>
                    <SelectItem value="advanced">Advanced (3-5 years)</SelectItem>
                    <SelectItem value="elite">Elite (5+ years)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="weightLbs">Weight (lbs)</Label>
                <Input
                  id="weightLbs"
                  type="number"
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(e.target.value)}
                  placeholder="165"
                  min="60"
                  max="450"
                />
              </div>

              <div className="space-y-2">
                <Label>Height</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      id="heightFeet"
                      type="number"
                      value={heightFeet}
                      onChange={(e) => setHeightFeet(e.target.value)}
                      placeholder="5"
                      min="3"
                      max="8"
                    />
                    <p className="text-xs text-muted-foreground mt-1">ft</p>
                  </div>
                  <div className="flex-1">
                    <Input
                      id="heightInches"
                      type="number"
                      value={heightInches}
                      onChange={(e) => setHeightInches(e.target.value)}
                      placeholder="10"
                      min="0"
                      max="11"
                    />
                    <p className="text-xs text-muted-foreground mt-1">in</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goals">Training Goals</Label>
              <Textarea
                id="goals"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="e.g., Improve 2k time to sub-7:00, build endurance for head races, prepare for spring racing season..."
                rows={3}
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-medium mb-4">Optional Features</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="enableStrength">Strength Training</Label>
                    <p className="text-xs text-muted-foreground">Include strength workout tracking and suggestions</p>
                  </div>
                  <Switch
                    id="enableStrength"
                    checked={enableStrengthTraining}
                    onCheckedChange={setEnableStrengthTraining}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="enableMeals">Meal Plans</Label>
                    <p className="text-xs text-muted-foreground">Include AI-generated meal suggestions</p>
                  </div>
                  <Switch
                    id="enableMeals"
                    checked={enableMealPlans}
                    onCheckedChange={setEnableMealPlans}
                  />
                </div>

                {enableMealPlans && (
                  <div className="space-y-4 pl-4 border-l-2 border-muted">
                    <div className="space-y-2">
                      <Label htmlFor="dietGoal">Diet Goal</Label>
                      <Select value={dietGoal} onValueChange={setDietGoal}>
                        <SelectTrigger id="dietGoal">
                          <SelectValue placeholder="Select goal" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cut">Cut (Lose Fat)</SelectItem>
                          <SelectItem value="maintain">Maintain</SelectItem>
                          <SelectItem value="bulk">Bulk (Build Muscle)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {dietGoal === "cut" && "Calorie deficit for fat loss while maintaining performance"}
                        {dietGoal === "maintain" && "Balanced calories to maintain current weight"}
                        {dietGoal === "bulk" && "Calorie surplus for muscle and strength gains"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="allergies">Food Allergies / Restrictions</Label>
                      <Input
                        id="allergies"
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                        placeholder="e.g., peanuts, shellfish, dairy, gluten"
                      />
                      <p className="text-xs text-muted-foreground">
                        Separate multiple allergies with commas
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Button type="submit" disabled={updateProfile.isPending}>
              {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <NotificationSettings />
    </div>
  );
};