import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Target, TrendingUp, Users, Utensils, ArrowRight, Sparkles, CheckCircle2, Zap } from "lucide-react";
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

  const features = [
    {
      icon: Activity,
      title: "Progressive Training",
      description: "AI-generated plans with splits that get faster week-over-week to build speed and endurance for your 2K",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: Target,
      title: "Full Strength Programs",
      description: "Complete daily strength workouts with 4-6 exercises tailored to rowing performance",
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      icon: Utensils,
      title: "Meal Planning",
      description: "Daily nutrition plans with breakfast, lunch, dinner, and snacks optimized for training",
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      icon: Users,
      title: "Team Management",
      description: "Coaches can form teams, share plans, and compare times between athletes",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      icon: TrendingUp,
      title: "Workout Tracking",
      description: "Log and track your erg and strength workouts with complete history and analytics",
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      icon: Zap,
      title: "Device Integration",
      description: "Connect to Concept2 ergs and heart rate monitors via Bluetooth for real-time data",
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
  ];

  const benefits = [
    "Personalized AI-powered training plans",
    "Track progress with detailed analytics",
    "Connect with coaches and teammates",
    "Full nutrition planning included",
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-hero py-20 md:py-28 px-6">
        {/* Background decorations */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-secondary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center">
            {/* Logo */}
            <div className="animate-fade-in mb-8">
              <img 
                src={crewsyncLogo} 
                alt="CrewSync" 
                className="h-16 md:h-20 mx-auto rounded-xl shadow-lg border-2 border-white/20" 
              />
            </div>
            
            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 animate-fade-in-up leading-tight">
              Your AI-Powered<br />
              <span className="text-secondary">Rowing Coach</span>
            </h1>
            
            {/* Subheadline */}
            <p className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto animate-fade-in-up delay-100 leading-relaxed">
              Personalized training plans, team management, progressive speed training, 
              and complete nutrition – all synced for peak performance.
            </p>
            
            {/* Benefits list */}
            <div className="flex flex-wrap justify-center gap-3 mb-10 animate-fade-in-up delay-200">
              {benefits.map((benefit, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-white/90 text-sm"
                >
                  <CheckCircle2 className="h-4 w-4 text-secondary" />
                  {benefit}
                </div>
              ))}
            </div>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up delay-300">
              {!isAuthenticated ? (
                <>
                  <Button 
                    size="xl" 
                    variant="secondary"
                    onClick={() => navigate("/auth")}
                    className="shadow-glow group"
                  >
                    Get Started Free
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                  <Button 
                    size="xl" 
                    variant="outline"
                    onClick={() => navigate("/auth")}
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
                  >
                    Sign In
                  </Button>
                </>
              ) : (
                <Button 
                  size="xl" 
                  variant="secondary"
                  onClick={() => navigate("/dashboard")}
                  className="shadow-glow group"
                >
                  Go to Dashboard
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-gradient-subtle">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Sparkles className="h-4 w-4" />
              Everything You Need
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Train Smarter, Not Harder
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              CrewSync combines AI-powered training, nutrition planning, and team management 
              into one seamless platform.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="group hover-lift border-2 border-transparent hover:border-primary/20 animate-fade-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardHeader className="space-y-4">
                  <div className={`w-14 h-14 rounded-xl ${feature.bgColor} flex items-center justify-center transition-transform group-hover:scale-110`}>
                    <feature.icon className={`h-7 w-7 ${feature.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg mb-2">{feature.title}</CardTitle>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-6 border-y border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div className="space-y-2">
              <div className="text-3xl md:text-4xl font-bold text-primary">AI</div>
              <div className="text-muted-foreground text-sm">Powered Plans</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl md:text-4xl font-bold text-primary">7</div>
              <div className="text-muted-foreground text-sm">Day Plans</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl md:text-4xl font-bold text-primary">100%</div>
              <div className="text-muted-foreground text-sm">Personalized</div>
            </div>
            <div className="space-y-2">
              <div className="text-3xl md:text-4xl font-bold text-primary">∞</div>
              <div className="text-muted-foreground text-sm">Workouts Tracked</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="py-20 px-6 bg-gradient-hero relative overflow-hidden">
          <div className="absolute top-0 left-1/2 w-96 h-96 bg-secondary/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          
          <div className="relative max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Ready to Transform Your Rowing?
            </h2>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Join athletes and coaches using CrewSync to reach peak performance. 
              Start your journey today.
            </p>
            <Button 
              size="xl" 
              variant="secondary"
              onClick={() => navigate("/auth")}
              className="shadow-glow group"
            >
              Start Training Now
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={crewsyncLogo} alt="CrewSync" className="h-6 w-6 rounded" />
            <span>CrewSync</span>
          </div>
          <div>© {new Date().getFullYear()} CrewSync. Train smarter.</div>
        </div>
      </footer>
    </div>
  );
};

export default Index;