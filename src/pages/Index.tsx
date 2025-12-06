import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Target, TrendingUp, Users, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

const Index = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setIsAuthenticated(!!session);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-hero py-20 px-6">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="relative max-w-7xl mx-auto text-center">
          <img src={crewsyncLogo} alt="CrewSync" className="h-20 mx-auto mb-8 rounded-lg shadow-lg" />
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 animate-fade-in">
            Your AI-Powered Rowing Coach
          </h1>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Personalized training plans, team management, progressive speed training, and complete nutrition – all synced for peak performance.
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
          {isAuthenticated && (
            <Button 
              size="lg" 
              variant="secondary"
              onClick={() => navigate("/dashboard")}
              className="shadow-glow"
            >
              Go to Dashboard
            </Button>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Everything You Need to Excel</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <Activity className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Progressive Training</CardTitle>
                <CardDescription>
                  AI-generated plans with splits that get faster week-over-week to build speed and endurance for your 2K
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <Target className="h-12 w-12 text-secondary mb-4" />
                <CardTitle>Full Strength Programs</CardTitle>
                <CardDescription>
                  Complete daily strength workouts with 4-6 exercises tailored to rowing performance
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <Utensils className="h-12 w-12 text-accent mb-4" />
                <CardTitle>Meal Planning</CardTitle>
                <CardDescription>
                  Daily nutrition plans with breakfast, lunch, dinner, and snacks optimized for training
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <Users className="h-12 w-12 text-primary mb-4" />
                <CardTitle>Team Management</CardTitle>
                <CardDescription>
                  Coaches can form teams, share plans, and compare times between athletes
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <TrendingUp className="h-12 w-12 text-secondary mb-4" />
                <CardTitle>Workout Tracking</CardTitle>
                <CardDescription>
                  Log and track your erg and strength workouts with complete history
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-primary/20 hover:border-primary transition-colors">
              <CardHeader>
                <Activity className="h-12 w-12 text-accent mb-4" />
                <CardTitle>Device Integration</CardTitle>
                <CardDescription>
                  Connect to Concept2 ergs and heart rate monitors via Bluetooth
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="py-20 px-6 bg-gradient-primary">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">
              Ready to Transform Your Rowing?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Join athletes and coaches using CrewSync to reach peak performance
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