import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, BookOpen, LogOut, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getSessionUser } from "@/lib/getUser";

interface Props {
  onNavigateToSettings?: () => void;
}

const CoachProfile = ({ onNavigateToSettings }: Props) => {
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const name = (profile as any)?.full_name || (profile as any)?.username || "Coach";
  const email = (profile as any)?.email || "";
  const yearsCoaching = (profile as any)?.years_coaching ?? null;
  const program = (profile as any)?.program_name || (profile as any)?.school || null;
  const role = (profile as any)?.user_type || "coach";

  return (
    <div className="space-y-4 pb-6">
      {/* Profile card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Coach Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground truncate">{name}</p>
              <p className="text-sm text-muted-foreground capitalize">{role}</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {email && (
              <div className="flex items-center gap-2.5 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-foreground truncate">{email}</span>
              </div>
            )}
            {program && (
              <div className="flex items-center gap-2.5 text-sm">
                <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">{program}</span>
              </div>
            )}
            {yearsCoaching != null && (
              <div className="flex items-center gap-2.5 text-sm">
                <Settings className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">{yearsCoaching} year{yearsCoaching !== 1 ? "s" : ""} coaching experience</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings link */}
      {onNavigateToSettings && (
        <Button variant="outline" className="w-full gap-2" onClick={onNavigateToSettings}>
          <Settings className="h-4 w-4" />
          Account Settings
        </Button>
      )}

      {/* Sign out */}
      <Button variant="ghost" className="w-full gap-2 text-muted-foreground" onClick={handleLogout}>
        <LogOut className="h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
};

export default CoachProfile;
