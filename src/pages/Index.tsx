import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import WorkoutForm from "@/components/WorkoutForm";
import WorkoutDisplay from "@/components/WorkoutDisplay";
import { supabase } from "@/integrations/supabase/client";

interface WorkoutPlan {
  title: string;
  description: string;
  workouts: Array<{
    day: string;
    type: string;
    duration: string;
    intensity: string;
    details: string;
    focus: string;
  }>;
  tips: string[];
  nutritionAdvice: string;
  recoveryNotes: string;
}

const Index = () => {
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAuthenticated(!!session);
  };

  useState(() => {
    checkAuth();
  });

  const handleGenerateWorkout = async (formData: any) => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke("generate-workout", {
        body: formData,
      });

      if (error) throw error;
      
      setWorkoutPlan(data.workoutPlan);
    } catch (error: any) {
      console.error("Error generating workout:", error);
      alert(error.message || "Failed to generate workout plan. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-hero py-20 px-6">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 animate-fade-in">
            AI-Powered Rowing Coach
          </h1>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Get personalized training plans tailored to your experience, goals, and performance data
          </p>
          {!isAuthenticated && (
            <div className="flex gap-4 justify-center">
              <Button 
                size="lg" 
                variant="secondary"
                onClick={() => navigate("/auth")}
                className="shadow-glow"
              >
                Get Started
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <Activity className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Smart Training</CardTitle>
                <CardDescription>
                  AI-generated workouts based on your experience and goals
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <Target className="h-12 w-12 text-secondary mb-4" />
                <CardTitle>Goal-Oriented</CardTitle>
                <CardDescription>
                  Personalized plans targeting endurance, speed, or competition
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <TrendingUp className="h-12 w-12 text-accent mb-4" />
                <CardTitle>Progressive Loading</CardTitle>
                <CardDescription>
                  Scientifically-designed programs that adapt to your progress
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Workout Generator Section */}
      {isAuthenticated && (
        <section className="py-16 px-6 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8">Generate Your Training Plan</h2>
            
            {!workoutPlan ? (
              <WorkoutForm onSubmit={handleGenerateWorkout} isLoading={isLoading} />
            ) : (
              <div className="space-y-6">
                <WorkoutDisplay plan={workoutPlan} />
                <div className="text-center">
                  <Button onClick={() => setWorkoutPlan(null)} variant="outline">
                    Generate New Plan
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="py-20 px-6 bg-gradient-primary">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">
              Ready to Transform Your Rowing?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Join athletes using AI-powered training to reach their peak performance
            </p>
            <Button 
              size="lg" 
              variant="secondary"
              onClick={() => navigate("/auth")}
              className="shadow-glow"
            >
              Start Training Now
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};

export default Index;