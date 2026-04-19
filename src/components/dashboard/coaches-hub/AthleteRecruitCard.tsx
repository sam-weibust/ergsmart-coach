import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Star, User } from "lucide-react";
import { AthleteProfile } from "./types";
import { fmtSeconds, cmToFtIn, kgToLbs } from "./utils";

interface Props {
  athlete: AthleteProfile;
  onClick: () => void;
}

export function AthleteRecruitCard({ athlete, onClick }: Props) {
  const name = athlete.profiles?.full_name ?? "Athlete";
  const score = athlete.relevance_score;

  return (
    <Card
      className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
            {athlete.avatar_url ? (
              <img src={athlete.avatar_url} alt={name} className="w-full h-full object-cover rounded-full" />
            ) : (
              <User className="h-6 w-6 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-foreground truncate">{name}</p>
              {score != null && (
                <Badge
                  variant="secondary"
                  className={`text-xs shrink-0 ${
                    score >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                    score >= 60 ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" :
                    "bg-muted text-muted-foreground"
                  }`}
                >
                  <Star className="h-2.5 w-2.5 mr-1" />
                  {score}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {[athlete.school, athlete.location].filter(Boolean).join(" · ")}
            </p>
          </div>
          {athlete.combine_score != null && (
            <Badge variant="outline" className="text-xs shrink-0">
              VCS {athlete.combine_score}
            </Badge>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <StatCell label="Best 2k" value={fmtSeconds(athlete.best_2k?.time_seconds)} />
          <StatCell label="W/kg" value={athlete.best_2k?.watts_per_kg ? athlete.best_2k.watts_per_kg.toFixed(2) : "—"} />
          <StatCell label="Grad" value={athlete.grad_year ? String(athlete.grad_year) : "—"} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <StatCell label="Height" value={cmToFtIn(athlete.profiles?.height)} />
          <StatCell label="Weight" value={kgToLbs(athlete.profiles?.weight)} />
          <StatCell label="Division" value={athlete.division_interest ?? "—"} />
        </div>

        {/* Relevance reasoning */}
        {athlete.relevance_reasoning && (
          <p className="text-xs text-muted-foreground line-clamp-2 border-t border-border pt-2">
            <TrendingUp className="h-3 w-3 inline mr-1 text-primary" />
            {athlete.relevance_reasoning}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg py-1.5 px-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}
