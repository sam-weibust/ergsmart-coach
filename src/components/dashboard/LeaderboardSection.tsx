import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, ExternalLink, ShieldCheck } from "lucide-react";

export const LeaderboardSection = () => {
  const navigate = useNavigate();
  return (
    <Card className="shadow-card border-border">
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <Trophy className="h-10 w-10 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Global Leaderboard</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-sm">
            Verified erg scores from Concept2 Logbook sync and live PM5 sessions.
            Manual entries are not eligible.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-full px-3 py-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          All times verified automatically
        </div>
        <Button onClick={() => navigate("/leaderboard")} className="gap-2">
          <ExternalLink className="h-4 w-4" />
          Open Leaderboard
        </Button>
      </CardContent>
    </Card>
  );
};
