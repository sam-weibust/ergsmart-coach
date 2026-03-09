import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

const formatInterval = (interval: string | null): string => {
  if (!interval) return "-";
  const match = interval.match(/(\d+):(\d+):(\d+\.?\d*)/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseFloat(match[3]);
    const totalMinutes = hours * 60 + minutes;
    return `${totalMinutes}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
  return interval;
};

const getDistanceLabel = (meters: number): string => {
  const labels: Record<number, string> = { 2000: "2K", 5000: "5K", 6000: "6K" };
  return labels[meters] || `${meters}m`;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "verified":
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" />Verified</Badge>;
    case "rejected":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    default:
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  }
};

export const MySubmissions = () => {
  const { data: submissions, isLoading } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("verified_times")
        .select("*")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!submissions || submissions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My Submissions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {submissions.map((sub: any) => (
            <div 
              key={sub.id} 
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
            >
              <div className="flex items-center gap-4">
                <Badge variant="outline">{getDistanceLabel(sub.distance)}</Badge>
                <span className="font-mono font-bold">{formatInterval(sub.time_achieved)}</span>
                <span className="text-sm text-muted-foreground">{sub.category}</span>
              </div>
              <div className="flex items-center gap-3">
                {getStatusBadge(sub.verification_status)}
                {sub.rejection_reason && (
                  <span className="text-xs text-destructive max-w-48 truncate">
                    {sub.rejection_reason}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
