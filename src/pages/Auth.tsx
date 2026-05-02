import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Mail, Lock, User, Sparkles, Heart } from "lucide-react";
import crewsyncLogo from "@/assets/crewsync-logo-full.jpg";

const SIGNUP_ROLES = [
  { value: "athlete", label: "Athlete", desc: "I compete and train" },
  { value: "coxswain", label: "Coxswain", desc: "I cox a boat" },
  { value: "coach", label: "Coach", desc: "I coach a team" },
  { value: "organizer", label: "Organizer", desc: "I manage a program or club" },
] as const;

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupRole, setSignupRole] = useState("athlete");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get("ref");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: signupRole,
          },
        },
      });

      if (error) throw error;

      // Handle referral
      if (referralCode && data.user) {
        try {
          // Find referrer by username (referral code = username)
          const { data: referrer } = await supabase
            .from("profiles")
            .select("id")
            .eq("username", referralCode)
            .maybeSingle();

          if (referrer) {
            await supabase.from("referrals" as any).insert({
              referrer_user_id: referrer.id,
              referred_user_id: data.user.id,
              referrer_code: referralCode,
              rewarded_at: new Date().toISOString(),
            });
            toast.success("🎉 Welcome! You and your referrer both earned a reward!");
          }
        } catch {
          // Referral tracking failure shouldn't block signup
        }
      } else {
        toast.success("Account created successfully! Redirecting...");
      }
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/dashboard",
      },
    });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast.success("Signed in successfully!");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left side - Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a1628] relative overflow-hidden items-center justify-center p-12">
        {/* Background decorations */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#2d6be4]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#2d6be4]/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      
        <div className="relative text-center text-white max-w-md animate-fade-in">
          <img 
            src={crewsyncLogo} 
            alt="CrewSync" 
            className="h-20 mx-auto mb-8 rounded-2xl shadow-lg border-2 border-white/30 animate-float" 
          />
          <h1 className="text-4xl font-bold mb-4">Welcome to CrewSync</h1>
          <p className="text-white/90 text-lg mb-8 leading-relaxed">
            Your AI-powered rowing coach. Train smarter, get stronger, and reach your peak performance.
          </p>
          <div className="flex items-center justify-center gap-6 text-white/80 text-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Powered
            </div>
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Made for Rowers
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Auth forms */}
      <div className="flex-1 flex flex-col bg-[#f8f9fb]">
        {/* Back button */}
        <div className="p-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Button>
        </div>
        
        <div className="flex-1 flex items-center justify-center px-4 pb-12">
          <div className="w-full max-w-md">
            {/* Logo and branding - mobile only */}
            <div className="text-center mb-8 lg:hidden">
              <img 
                src={crewsyncLogo} 
                alt="CrewSync" 
                className="h-16 mx-auto mb-6 rounded-xl shadow-lg border border-border" 
              />
              <h1 className="text-3xl font-bold mb-2">
                Welcome to <span className="text-gradient">CrewSync</span>
              </h1>
              <p className="text-muted-foreground">Your personalized rowing training partner</p>
            </div>

            <Card className="shadow-medium border-2 animate-fade-in-up">
            <CardHeader className="pb-4">
                <CardTitle className="text-2xl">Get Started</CardTitle>
                <CardDescription className="text-base">Sign in or create an account to access your training</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="signin" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6 h-12">
                    <TabsTrigger value="signin" className="text-sm font-medium">Sign In</TabsTrigger>
                    <TabsTrigger value="signup" className="text-sm font-medium">Create Account</TabsTrigger>
                  </TabsList>

                  <TabsContent value="signin" className="mt-0">
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                      </svg>
                      Sign in with Google
                    </button>
                    <div className="relative my-5">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-400">or</span>
                      </div>
                    </div>
                    <form onSubmit={handleSignIn} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="signin-email" className="text-sm font-medium">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="signin-email"
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signin-password" className="text-sm font-medium">Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="signin-password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          "Sign In"
                        )}
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup" className="mt-0">
                    {/* Role selector */}
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      {SIGNUP_ROLES.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setSignupRole(r.value)}
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            signupRole === r.value
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <p className={`text-sm font-semibold ${signupRole === r.value ? "text-blue-700 dark:text-blue-400" : ""}`}>{r.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                      </svg>
                      Sign up with Google
                    </button>
                    <div className="relative my-5">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-400">or</span>
                      </div>
                    </div>
                    <form onSubmit={handleSignUp} className="space-y-5">
                      <div className="space-y-2">
                        <Label htmlFor="signup-name" className="text-sm font-medium">Full Name</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="signup-name"
                            type="text"
                            placeholder="John Doe"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-email" className="text-sm font-medium">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="signup-email"
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="pl-10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-password" className="text-sm font-medium">Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="signup-password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="pl-10"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                      </div>

                      <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating account...
                          </>
                        ) : (
                          "Create Account"
                        )}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          
            {/* Footer text */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              By continuing, you agree to our terms of service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;