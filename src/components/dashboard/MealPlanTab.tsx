import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, UtensilsCrossed, Flame, Beef, Wheat, Droplets, ChefHat, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface MealPlanTabProps {
  profile: any;
}

const MealPlanTab = ({ profile }: MealPlanTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);

  // Fetch saved meal plans for calorie tracker
  const { data: savedMeals, isLoading: mealsLoading } = useQuery({
    queryKey: ["saved-meal-plans"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("meal_date", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Group saved meals by date for the tracker
  const mealsByDate = useMemo(() => {
    if (!savedMeals) return {};
    const grouped: Record<string, any[]> = {};
    for (const meal of savedMeals) {
      const date = meal.meal_date;
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(meal);
    }
    return grouped;
  }, [savedMeals]);

  // Calculate daily totals for tracker
  const dailyTotals = useMemo(() => {
    return Object.entries(mealsByDate).map(([date, meals]) => {
      const totals = meals.reduce(
        (acc: any, m: any) => ({
          calories: acc.calories + (m.calories || 0),
          protein: acc.protein + (m.protein || 0),
          carbs: acc.carbs + (m.carbs || 0),
          fats: acc.fats + (m.fats || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 }
      );
      return { date, meals, ...totals };
    });
  }, [mealsByDate]);

  // Calorie target based on profile
  const calorieTarget = useMemo(() => {
    if (!profile?.weight) return 2500;
    const base = profile.weight * 35; // rough athletic TDEE
    const dietGoal = profile?.diet_goal || "maintain";
    if (dietGoal === "cut") return Math.round(base - 400);
    if (dietGoal === "bulk") return Math.round(base + 400);
    return Math.round(base);
  }, [profile]);

  const generateMealPlan = async () => {
    setLoading(true);
    try {
      const dietGoal = profile?.diet_goal || "maintain";

      const { data, error } = await supabase.functions.invoke("generate-meals", {
        body: {
          weight: profile.weight,
          height: profile.height,
          age: profile.age,
          goals: profile.goals,
          trainingLoad: "moderate",
          dietGoal,
          allergies: profile.allergies || [],
        },
      });

      if (error) throw error;
      setGeneratedPlan(data.mealPlan);
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
    if (!profile || !generatedPlan) return;
    setLoading(true);
    try {
      const meals = generatedPlan.meals.map((meal: any) => ({
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

      toast({ title: "Meal plan saved!", description: "Your daily meal plan has been saved." });
      setGeneratedPlan(null);
      queryClient.invalidateQueries({ queryKey: ["saved-meal-plans"] });
    } catch (error) {
      console.error("Error saving meal plan:", error);
      toast({ title: "Error", description: "Failed to save meal plan.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const deleteDayMeals = async (date: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("meal_plans")
        .delete()
        .eq("user_id", user.id)
        .eq("meal_date", date);

      if (error) throw error;
      toast({ title: "Meals deleted" });
      queryClient.invalidateQueries({ queryKey: ["saved-meal-plans"] });
    } catch (error) {
      toast({ title: "Error deleting meals", variant: "destructive" });
    }
  };

  const dietGoal = profile?.diet_goal || "maintain";
  const dietLabel = dietGoal === "cut" ? "Cut" : dietGoal === "bulk" ? "Bulk" : "Maintain";
  const todayStr = new Date().toISOString().split("T")[0];
  const todayData = dailyTotals.find((d) => d.date === todayStr);
  const todayCalories = todayData?.calories || 0;
  const caloriePercent = Math.min((todayCalories / calorieTarget) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Calorie Tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            Today's Calorie Tracker
          </CardTitle>
          <CardDescription>
            Target: {calorieTarget} cal ({dietLabel} mode)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{todayCalories} / {calorieTarget} cal</span>
              <span className="text-muted-foreground">{Math.round(caloriePercent)}%</span>
            </div>
            <Progress value={caloriePercent} className="h-3" />
          </div>

          {todayData && (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted rounded-lg">
                <Beef className="h-4 w-4 mx-auto mb-1 text-red-500" />
                <div className="text-lg font-bold">{Math.round(todayData.protein)}g</div>
                <div className="text-xs text-muted-foreground">Protein</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Wheat className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <div className="text-lg font-bold">{Math.round(todayData.carbs)}g</div>
                <div className="text-xs text-muted-foreground">Carbs</div>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Droplets className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                <div className="text-lg font-bold">{Math.round(todayData.fats)}g</div>
                <div className="text-xs text-muted-foreground">Fats</div>
              </div>
            </div>
          )}

          {!todayData && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No meals logged today. Generate a meal plan below!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Generate Meal Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5" />
            Generate Meal Plan
          </CardTitle>
          <CardDescription>
            AI-powered daily meal plan with recipes and macro breakdown
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!generatedPlan ? (
            <Button onClick={generateMealPlan} disabled={loading || !profile?.weight} className="w-full">
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
              {generatedPlan.meals.map((meal: any, idx: number) => (
                <Card key={idx} className="border">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">{meal.meal_type}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{meal.timing}</p>
                      </div>
                      <span className="text-sm font-semibold bg-primary/10 text-primary px-2 py-1 rounded">
                        {meal.calories} cal
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm">{meal.description}</p>

                    {/* Recipe */}
                    {meal.recipe && (
                      <Accordion type="single" collapsible>
                        <AccordionItem value="recipe" className="border-none">
                          <AccordionTrigger className="py-2 text-sm hover:no-underline">
                            <span className="flex items-center gap-2">
                              <ChefHat className="h-4 w-4" />
                              Recipe & Instructions
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 text-sm">
                              {meal.recipe.ingredients && (
                                <div>
                                  <h5 className="font-medium mb-1">Ingredients:</h5>
                                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                    {meal.recipe.ingredients.map((ing: string, i: number) => (
                                      <li key={i}>{ing}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {meal.recipe.instructions && (
                                <div>
                                  <h5 className="font-medium mb-1">Instructions:</h5>
                                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                                    {meal.recipe.instructions.map((step: string, i: number) => (
                                      <li key={i}>{step}</li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                              {meal.recipe.prep_time && (
                                <p className="text-muted-foreground">
                                  ⏱ Prep: {meal.recipe.prep_time} | Cook: {meal.recipe.cook_time}
                                </p>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}

                    {/* Macros */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                      <div className="text-center p-2 bg-muted rounded">
                        <div className="text-lg font-bold text-red-500">{meal.protein}g</div>
                        <div className="text-xs text-muted-foreground">Protein</div>
                      </div>
                      <div className="text-center p-2 bg-muted rounded">
                        <div className="text-lg font-bold text-amber-500">{meal.carbs}g</div>
                        <div className="text-xs text-muted-foreground">Carbs</div>
                      </div>
                      <div className="text-center p-2 bg-muted rounded">
                        <div className="text-lg font-bold text-blue-500">{meal.fats}g</div>
                        <div className="text-xs text-muted-foreground">Fats</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Daily Totals */}
              {generatedPlan.dailyTotals && (
                <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border">
                  <CardContent className="pt-4">
                    <h3 className="font-semibold mb-3">Daily Totals</h3>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 bg-background rounded">
                        <div className="text-xl font-bold">{generatedPlan.dailyTotals.calories}</div>
                        <div className="text-xs text-muted-foreground">Calories</div>
                      </div>
                      <div className="p-2 bg-background rounded">
                        <div className="text-xl font-bold text-red-500">{generatedPlan.dailyTotals.protein}g</div>
                        <div className="text-xs text-muted-foreground">Protein</div>
                      </div>
                      <div className="p-2 bg-background rounded">
                        <div className="text-xl font-bold text-amber-500">{generatedPlan.dailyTotals.carbs}g</div>
                        <div className="text-xs text-muted-foreground">Carbs</div>
                      </div>
                      <div className="p-2 bg-background rounded">
                        <div className="text-xl font-bold text-blue-500">{generatedPlan.dailyTotals.fats}g</div>
                        <div className="text-xs text-muted-foreground">Fats</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {generatedPlan.hydrationNote && (
                <p className="text-sm text-muted-foreground italic">💧 {generatedPlan.hydrationNote}</p>
              )}

              <div className="flex gap-2">
                <Button onClick={saveMealPlan} disabled={loading} className="flex-1">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Meal Plan
                </Button>
                <Button onClick={generateMealPlan} disabled={loading} variant="outline">
                  Regenerate
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saved Meal History */}
      {dailyTotals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Meal History</CardTitle>
            <CardDescription>Your saved meal plans and daily macro totals</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {dailyTotals.slice(0, 14).map((day) => (
                <AccordionItem key={day.date} value={day.date}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex justify-between items-center w-full pr-4">
                      <span className="font-medium">
                        {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{day.calories} cal</span>
                        <span className="text-red-500">{Math.round(day.protein)}g P</span>
                        <span className="text-amber-500">{Math.round(day.carbs)}g C</span>
                        <span className="text-blue-500">{Math.round(day.fats)}g F</span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {day.meals.map((meal: any) => (
                        <div key={meal.id} className="flex justify-between items-start p-3 bg-muted rounded-lg">
                          <div>
                            <span className="font-medium text-sm">{meal.meal_type}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">{meal.description}</p>
                          </div>
                          <span className="text-xs font-medium whitespace-nowrap ml-2">{meal.calories} cal</span>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteDayMeals(day.date)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete Day
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MealPlanTab;
