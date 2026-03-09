import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, User, Filter, ShieldCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "U16", label: "Under 16" },
  { value: "U18", label: "Under 18" },
  { value: "U23", label: "Under 23" },
  { value: "High School", label: "High School" },
  { value: "Club", label: "Club" },
  { value: "D1", label: "Division 1" },
  { value: "D2", label: "Division 2" },
  { value: "D3", label: "Division 3" },
  { value: "Masters", label: "Masters" },
  { value: "Open", label: "Open" },
];

const DISTANCES = [
  { value: 2000, label: "2K" },
  { value: 5000, label: "5K" },
  { value: 6000, label: "6K" },
];

const GENDERS = [
  { value: "all", label: "All" },
  { value: "male", label: "Men" },
  { value: "female", label: "Women" },
];

const WEIGHT_CLASSES = [
  { value: "all", label: "All" },
  { value: "open", label: "Open Weight" },
  { value: "lightweight", label: "Lightweight" },
];

const formatInterval = (interval: string | null): string => {
  if (!interval) return "-";
  // PostgreSQL interval format: "00:07:05.2" or similar
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

export const GlobalLeaderboard = () => {
  const [category, setCategory] = useState("all");
  const [gender, setGender] = useState("all");
  const [weightClass, setWeightClass] = useState("all");
  const [distance, setDistance] = useState("2000");

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["global-leaderboard", distance, category, gender, weightClass],
    queryFn: async () => {
      let query = supabase
        .from("verified_times")
        .select(`
          id,
          user_id,
          distance,
          time_achieved,
          category,
          gender,
          weight_class,
          verified_at,
          profiles!verified_times_user_id_fkey(full_name, username)
        `)
        .eq("verification_status", "verified")
        .eq("distance", parseInt(distance))
        .order("time_achieved", { ascending: true })
        .limit(100);

      if (category !== "all") {
        query = query.eq("category", category);
      }
      if (gender !== "all") {
        query = query.eq("gender", gender);
      }
      if (weightClass !== "all") {
        query = query.eq("weight_class", weightClass);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 2:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="w-5 text-center font-bold text-muted-foreground">{index + 1}</span>;
    }
  };

  const getDistanceLabel = (meters: number): string => {
    return DISTANCES.find(d => d.value === meters)?.label || `${meters}m`;
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Global Leaderboard
            </CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <ShieldCheck className="h-3 w-3" />
              All times verified with screenshot proof
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 p-4 bg-muted/30 rounded-xl border border-border">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          <Select value={distance} onValueChange={setDistance}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISTANCES.map(d => (
                <SelectItem key={d.value} value={d.value.toString()}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENDERS.map(g => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={weightClass} onValueChange={setWeightClass}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEIGHT_CLASSES.map(w => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Leaderboard Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[60px]">Rank</TableHead>
                <TableHead>Athlete</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="hidden md:table-cell">Weight</TableHead>
                <TableHead className="hidden lg:table-cell">Verified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading leaderboard...
                    </div>
                  </TableCell>
                </TableRow>
              ) : leaderboard && leaderboard.length > 0 ? (
                leaderboard.map((entry: any, index: number) => (
                  <TableRow 
                    key={entry.id}
                    className={index < 3 ? "bg-primary/5" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center justify-center">
                        {getRankIcon(index)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="font-medium">
                          {entry.profiles?.full_name || entry.profiles?.username || "Anonymous"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-bold text-lg">
                        {formatInterval(entry.time_achieved)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{entry.category}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">
                        {entry.weight_class === "lightweight" ? "LW" : "Open"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {entry.verified_at 
                        ? new Date(entry.verified_at).toLocaleDateString() 
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No verified times found for this category.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {leaderboard && leaderboard.length > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Showing top {leaderboard.length} verified {getDistanceLabel(parseInt(distance))} times
            {category !== "all" && ` in ${category}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
