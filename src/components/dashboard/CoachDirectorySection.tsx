import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Mail, Globe, School, Users, Phone } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const CoachDirectorySection = ({ profile }: { profile: any }) => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [divFilter, setDivFilter] = useState("all");
  const [generatingEmail, setGeneratingEmail] = useState<string | null>(null);

  const { data: coaches, isLoading } = useQuery({
    queryKey: ["rowing-coaches"],
    queryFn: async () => {
      const { data } = await supabase.from("rowing_coaches").select("*").order("school_name");
      return data || [];
    },
  });

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => { const { data: { user } } = await supabase.auth.getUser(); return user; },
  });

  const filtered = (coaches || []).filter((c: any) => {
    const matchesSearch = !search || c.school_name?.toLowerCase().includes(search.toLowerCase()) || c.coach_name?.toLowerCase().includes(search.toLowerCase()) || c.conference?.toLowerCase().includes(search.toLowerCase()) || c.state?.toLowerCase().includes(search.toLowerCase());
    const matchesDiv = divFilter === "all" || c.division === divFilter;
    return matchesSearch && matchesDiv;
  });

  const generateAndOpenEmail = async (coach: any) => {
    if (!currentUser) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    if (coach.email) {
      // Open email client directly with a basic subject
      const name = profile?.full_name || "Athlete";
      const subject = encodeURIComponent(`Rowing Recruitment Inquiry - ${name}`);
      window.open(`mailto:${coach.email}?subject=${subject}`);
      return;
    }
    toast({ title: "No email on file for this coach", variant: "destructive" });
  };

  const generateFullEmail = async (coach: any) => {
    if (!currentUser) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    setGeneratingEmail(coach.id);
    try {
      const session = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-recruit-emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": API_KEY,
          "Authorization": `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          athlete_info: profile?.full_name || "Athlete",
          target_school: coach.school_name,
        }),
      });
      const data = await res.json();
      const firstEmail = data.email_campaign?.[0];
      if (firstEmail && coach.email) {
        const subject = encodeURIComponent(firstEmail.subject || "Rowing Recruitment Inquiry");
        const body = encodeURIComponent(firstEmail.body || "");
        window.open(`mailto:${coach.email}?subject=${subject}&body=${body}`);
      } else if (firstEmail) {
        navigator.clipboard.writeText(`Subject: ${firstEmail.subject}\n\n${firstEmail.body}`);
        toast({ title: "Email copied to clipboard", description: "No email on file — paste into your email client." });
      }
    } catch {
      toast({ title: "Failed to generate email", variant: "destructive" });
    } finally {
      setGeneratingEmail(null);
    }
  };

  const DIV_BADGE: Record<string, string> = {
    D1: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    D2: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    D3: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    NAIA: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    Club: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><School className="h-4 w-4" />Coach Directory</CardTitle>
          <CardDescription>Search college rowing coaches and reach out directly</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search school, coach, conference, state..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={divFilter} onValueChange={setDivFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Division" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Divisions</SelectItem>
              <SelectItem value="D1">D1</SelectItem>
              <SelectItem value="D2">D2</SelectItem>
              <SelectItem value="D3">D3</SelectItem>
              <SelectItem value="NAIA">NAIA</SelectItem>
              <SelectItem value="Club">Club</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">{filtered.length} coaches found</div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((coach: any) => (
            <Card key={coach.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{coach.school_name}</h4>
                    <p className="text-sm text-muted-foreground">{coach.coach_name || "Head Coach"}</p>
                    {coach.title && coach.title !== "Head Coach" && (
                      <p className="text-xs text-muted-foreground">{coach.title}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${DIV_BADGE[coach.division] || ""}`}>
                    {coach.division}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {coach.conference && <p className="flex items-center gap-1.5"><Users className="h-3 w-3" />{coach.conference}</p>}
                  {coach.state && <p className="flex items-center gap-1.5"><School className="h-3 w-3" />{coach.state}</p>}
                  {coach.email && <p className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 flex-shrink-0" />{coach.email}</p>}
                </div>

                <div className="flex gap-2">
                  {coach.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => generateAndOpenEmail(coach)}
                    >
                      <Mail className="h-3 w-3 mr-1" />Email
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => generateFullEmail(coach)}
                    disabled={generatingEmail === coach.id}
                  >
                    {generatingEmail === coach.id ? (
                      <span className="flex items-center gap-1"><div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />AI Email</span>
                    ) : (
                      <><span className="mr-1">✨</span>AI Email</>
                    )}
                  </Button>
                  {coach.website && (
                    <Button size="sm" variant="ghost" className="px-2" asChild>
                      <a href={coach.website} target="_blank" rel="noopener noreferrer"><Globe className="h-3.5 w-3.5" /></a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <School className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p>No coaches match your search.</p>
            <p className="text-sm mt-1">Try a different school name or division.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
