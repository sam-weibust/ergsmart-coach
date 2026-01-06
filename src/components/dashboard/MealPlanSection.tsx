import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, UtensilsCrossed } from "lucide-react";

interface MealPlanSectionProps {
  profile: any;
  fullView?: boolean;
}

const MealPlanSection = ({ profile, fullView }: MealPlanSectionProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [mealPlan, setMealPlan] = useState<any>(null);

  const generateMealPlan = async () => {
    setLoading(true);
    try {
      // Get diet goal from profile, default to maintain
      const dietGoal = (profile as any)?.diet_goal || "maintain";
      
      const { data, error } = await supabase.functions.invoke("generate-meals", {
        body: {
          weight: profile.weight,
          goals: profile.goals,
          trainingLoad: "moderate",
          dietGoal: dietGoal,
        },
      });

      if (error) throw error;
      setMealPlan(data.mealPlan);
    } catch (error) {
      console.error("Error generating meal plan:", error);
      toast({
        title: "Error",
        description: "Failed to generate meal plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveMealPlan = async () => {
    if (!profile || !mealPlan) return;

    setLoading(true);
    try {
      const meals = mealPlan.meals.map((meal: any) => ({
        user_id: profile.id,
        meal_type: meal.meal_type,
        description: meal.description,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fats: meal.fats,
      }));

      const { error } = await supabase.from("meal_plans").insert(meals);

      if (error) throw error;

      toast({
        title: "Meal plan saved!",
        description: "Your daily meal plan has been saved.",
      });

      setMealPlan(null);
    } catch (error) {
      console.error("Error saving meal plan:", error);
      toast({
        title: "Error",
        description: "Failed to save meal plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const dietGoal = (profile as any)?.diet_goal || "maintain";
  const dietLabel = dietGoal === "cut" ? "Cut" : dietGoal === "bulk" ? "Bulk" : "Maintain";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UtensilsCrossed className="h-5 w-5" />
          Daily Meal Plan
          <span className="text-xs font-normal text-muted-foreground ml-2">
            ({dietLabel} mode)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!mealPlan ? (
          <Button onClick={generateMealPlan} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Today's Meal Plan
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-4">
            {mealPlan.meals.map((meal: any, idx: number) => (
              <div key={idx} className="p-4 border rounded-lg space-y-2">
                <h3 className="font-semibold text-lg">{meal.meal_type}</h3>
                <p className="text-sm text-muted-foreground">{meal.timing}</p>
                <p>{meal.description}</p>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{meal.calories} cal</span>
                  <span>P: {meal.protein}g</span>
                  <span>C: {meal.carbs}g</span>
                  <span>F: {meal.fats}g</span>
                </div>
              </div>
            ))}

            {mealPlan.dailyTotals && (
              <div className="p-4 bg-primary/10 rounded-lg">
                <h3 className="font-semibold mb-2">Daily Totals</h3>
                <div className="flex gap-4 text-sm">
                  <span>{mealPlan.dailyTotals.calories} cal</span>
                  <span>P: {mealPlan.dailyTotals.protein}g</span>
                  <span>C: {mealPlan.dailyTotals.carbs}g</span>
                  <span>F: {mealPlan.dailyTotals.fats}g</span>
                </div>
              </div>
            )}

            {mealPlan.hydrationNote && (
              <p className="text-sm text-muted-foreground italic">💧 {mealPlan.hydrationNote}</p>
            )}

            <div className="flex gap-2">
              <Button onClick={saveMealPlan} disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Meal Plan"
                )}
              </Button>
              <Button onClick={generateMealPlan} disabled={loading} variant="outline">
                Regenerate
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MealPlanSection;