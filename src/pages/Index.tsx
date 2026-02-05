import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Target, TrendingUp, Users, Utensils, ArrowRight, Sparkles, CheckCircle2, Zap, Heart, Star, Flame } from "lucide-react";
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
      color: "text-[hsl(24_95%_53%)]",
      bgColor: "bg-[hsl(24_95%_53%/0.1)]",
    },
    {
      icon: Target,
      title: "Full Strength Programs",
      description: "Complete daily strength workouts with 4-6 exercises tailored to rowing performance",
      color: "text-[hsl(340_82%_58%)]",
      bgColor: "bg-[hsl(340_82%_58%/0.1)]",
    },
    {
      icon: Utensils,
      title: "Meal Planning",
      description: "Daily nutrition plans with breakfast, lunch, dinner, and snacks optimized for training",
      color: "text-[hsl(175_70%_42%)]",
      bgColor: "bg-[hsl(175_70%_42%/0.1)]",
    },
    {
      icon: Users,
      title: "Team Management",
      description: "Coaches can form teams, share plans, and compare times between athletes",
      color: "text-[hsl(280_70%_55%)]",
      bgColor: "bg-[hsl(280_70%_55%/0.1)]",
    },
    {
      icon: TrendingUp,
      title: "Workout Tracking",
      description: "Log and track your erg and strength workouts with complete history and analytics",
      color: "text-[hsl(24_95%_53%)]",
      bgColor: "bg-[hsl(24_95%_53%/0.1)]",
    },
    {
      icon: Zap,
      title: "Device Integration",
      description: "Connect to Concept2 ergs and heart rate monitors via Bluetooth for real-time data",
      color: "text-[hsl(340_82%_58%)]",
      bgColor: "bg-[hsl(340_82%_58%/0.1)]",
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
      <section className="relative overflow-hidden bg-gradient-hero py-24 md:py-32 px-6">
        {/* Background decorations */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[hsl(340_82%_58%/0.25)] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-[hsl(24_95%_53%/0.25)] rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-[hsl(280_70%_55%/0.15)] rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        
        <div className="relative max-w-6xl mx-auto">
          <div className="text-center">
            {/* Logo */}
            <div className="animate-fade-in mb-10">
              <img 
                src={crewsyncLogo} 
                alt="CrewSync" 
                className="h-20 md:h-24 mx-auto rounded-2xl shadow-lg border-2 border-white/30 animate-float" 
              />
            </div>
            
            {/* Badge */}
            <div className="animate-fade-in-up mb-6">
              <span className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium border border-white/20">
                <Flame className="h-4 w-4 text-[hsl(40_90%_65%)]" />
                Your Personal AI Coach
              </span>
            </div>
            
            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-8 animate-fade-in-up leading-tight">
              Row Faster.<br />
              <span className="bg-gradient-to-r from-[hsl(40_90%_65%)] to-white bg-clip-text text-transparent">Get Stronger.</span>
            </h1>
            
            {/* Subheadline */}
            <p className="text-lg md:text-xl text-white/90 mb-12 max-w-2xl mx-auto animate-fade-in-up delay-100 leading-relaxed">
              AI-powered training plans that adapt to you. Track workouts, manage your team, 
              and fuel your performance – all in one welcoming space.
            </p>
            
            {/* Benefits list */}
            <div className="flex flex-wrap justify-center gap-3 mb-12 animate-fade-in-up delay-200">
              {benefits.map((benefit, index) => (
                <div 
                  key={index}
                  className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-full text-white text-sm font-medium border border-white/10 hover:bg-white/20 transition-all duration-300"
                >
                  <CheckCircle2 className="h-4 w-4 text-[hsl(40_90%_65%)]" />
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
                    onClick={() => navigate("/auth")}
                    className="bg-white text-[hsl(24_95%_45%)] hover:bg-white/90 shadow-lg group font-semibold text-lg px-8"
                  >
                    Start Training Free
                    <ArrowRight className="h-5 w-5 ml-1 transition-transform group-hover:translate-x-1" />
                  </Button>
                  <Button 
                    size="xl" 
                    variant="outline"
                    onClick={() => navigate("/auth")}
                    className="bg-transparent border-2 border-white/40 text-white hover:bg-white/15 hover:border-white/60"
                  >
                    Sign In
                  </Button>
                </>
              ) : (
                <Button 
                  size="xl" 
                  onClick={() => navigate("/dashboard")}
                  className="bg-white text-[hsl(24_95%_45%)] hover:bg-white/90 shadow-lg group font-semibold text-lg px-8"
                >
                  Go to Dashboard
                  <ArrowRight className="h-5 w-5 ml-1 transition-transform group-hover:translate-x-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 bg-gradient-subtle">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-semibold mb-6">
              <Sparkles className="h-4 w-4 animate-pulse-soft" />
              Everything You Need to Succeed
            </div>
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Train Smarter, <span className="text-gradient">Perform Better</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
              CrewSync combines AI-powered training, nutrition planning, and team management 
              into one seamless, energizing platform.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="group hover-lift border-2 border-transparent hover:border-primary/30 animate-fade-in-up bg-card"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardHeader className="space-y-4">
                  <div className={`w-14 h-14 rounded-2xl ${feature.bgColor} flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                    <feature.icon className={`h-7 w-7 ${feature.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">{feature.title}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
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
      <section className="py-20 px-6 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center">
            <div className="space-y-3">
              <div className="text-4xl md:text-5xl font-bold text-gradient">AI</div>
              <div className="text-muted-foreground text-sm">Powered Plans</div>
            </div>
            <div className="space-y-3">
              <div className="text-4xl md:text-5xl font-bold text-gradient">7</div>
              <div className="text-muted-foreground text-sm">Day Plans</div>
            </div>
            <div className="space-y-3">
              <div className="text-4xl md:text-5xl font-bold text-gradient">100%</div>
              <div className="text-muted-foreground text-sm">Personalized</div>
            </div>
            <div className="space-y-3">
              <div className="text-4xl md:text-5xl font-bold text-gradient flex items-center justify-center gap-1">
                <Heart className="h-8 w-8 text-secondary animate-pulse-soft" />
              </div>
              <div className="text-muted-foreground text-sm">Made for Athletes</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      {!isAuthenticated && (
        <section className="py-24 px-6 bg-gradient-hero relative overflow-hidden">
          <div className="absolute top-0 left-1/2 w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-[300px] h-[300px] bg-[hsl(280_70%_55%/0.2)] rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          
          <div className="relative max-w-3xl mx-auto text-center">
            <div className="mb-6">
              <Star className="h-12 w-12 text-[hsl(40_90%_65%)] mx-auto animate-bounce-gentle" />
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Ready to Transform Your Rowing?
            </h2>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Join athletes and coaches who are already crushing their goals. 
              Your best performance starts here.
            </p>
            <Button 
              size="xl" 
              onClick={() => navigate("/auth")}
              className="bg-white text-[hsl(24_95%_45%)] hover:bg-white/90 shadow-lg group font-semibold text-lg px-10"
            >
              Start Training Now
              <ArrowRight className="h-5 w-5 ml-1 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-border bg-card">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={crewsyncLogo} alt="CrewSync" className="h-6 w-6 rounded" />
            <span className="font-medium">CrewSync</span>
          </div>
          <div className="flex items-center gap-1">
            Made with <Heart className="h-4 w-4 text-secondary mx-1" /> for rowers
          </div>
          <div>© {new Date().getFullYear()} CrewSync</div>
        </div>
      </footer>
    </div>
  );
};

export default Index;