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
      const dietGoal = profile?.diet_goal || "maintain";

      const { data, error } = await supabase.functions.invoke("generate-meals", {
        body: {
          user_id: profile.id, // REQUIRED for your rewritten function
          dietary_preferences: profile.dietary_preferences || [],
          goals_override: profile.goals || null,
        },
      });

      if (error) throw error;
      if (!data) throw new Error("No meal plan returned");

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

  const dietGoal = profile?.diet_goal || "maintain";
  const dietLabel =
    dietGoal === "cut" ? "Cut" : dietGoal === "bulk" ? "Bulk" : "Maintain";

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
              <div key={idx} className="p-4 border rounded-lg space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{meal.meal_type}</h3>
                    <p className="text-sm text-muted-foreground">{meal.timing}</p>
                  </div>
                  <span className="text-sm font-medium bg-primary/10 text-primary px-2 py-1 rounded">
                    {meal.calories} cal
                  </span>
                </div>

                <p className="text-sm">{meal.description}</p>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="text-lg font-bold text-primary">{meal.protein}g</div>
                    <div className="text-xs text-muted-foreground">Protein</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="text-lg font-bold text-secondary">{meal.carbs}g</div>
                    <div className="text-xs text-muted-foreground">Carbs</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="text-lg font-bold text-accent">{meal.fats}g</div>
                    <div className="text-xs text-muted-foreground">Fats</div>
                  </div>
                </div>
              </div>
            ))}

            {mealPlan.dailyTotals && (
              <div className="p-4 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg border">
                <h3 className="font-semibold mb-3">Daily Totals</h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-background rounded">
                    <div className="text-xl font-bold">{mealPlan.dailyTotals.calories}</div>
                    <div className="text-xs text-muted-foreground">Calories</div>
                  </div>
                  <div className="p-2 bg-background rounded">
                    <div className="text-xl font-bold text-primary">{mealPlan.dailyTotals.protein}g</div>
                    <div className="text-xs text-muted-foreground">Protein</div>
                  </div>
                  <div className="p-2 bg-background rounded">
                    <div className="text-xl font-bold text-secondary">{mealPlan.dailyTotals.carbs}g</div>
                    <div className="text-xs text-muted-foreground">Carbs</div>
                  </div>
                  <div className="p-2 bg-background rounded">
                    <div className="text-xl font-bold text-accent">{mealPlan.dailyTotals.fats}g</div>
                    <div className="text-xs text-muted-foreground">Fats</div>
                  </div>
                </div>
              </div>
            )}

            {mealPlan.hydrationNote && (
              <p className="text-sm text-muted-foreground italic">
                💧 {mealPlan.hydrationNote}
              </p>
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
