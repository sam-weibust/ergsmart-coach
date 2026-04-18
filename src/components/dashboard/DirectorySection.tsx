import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Star, Search, ExternalLink } from "lucide-react";

export default function DirectorySection() {
  const [search, setSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["directory-listings"],
    queryFn: async () => {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, description, location, division, program_type, is_featured, athlete_count, coach_id")
        .eq("directory_opt_in" as any, true)
        .order("is_featured" as any, { ascending: false })
        .order("athlete_count" as any, { ascending: false });

      if (!teams || teams.length === 0) return [];

      const coachIds = [...new Set((teams as any[]).map((t: any) => t.coach_id).filter(Boolean))];
      let coachMap: Record<string, string> = {};
      if (coachIds.length > 0) {
        const { data: coaches } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", coachIds);
        if (coaches) coachMap = Object.fromEntries(coaches.map((c: any) => [c.id, c.full_name]));
      }

      return (teams as any[]).map((t: any) => ({ ...t, coachName: coachMap[t.coach_id] || "Unknown Coach" }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = (listings as any[]).filter((t: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.name?.toLowerCase().includes(q) || t.location?.toLowerCase().includes(q) || t.coachName?.toLowerCase().includes(q);
    const matchDiv = divisionFilter === "all" || t.division === divisionFilter;
    const matchType = typeFilter === "all" || t.program_type === typeFilter;
    return matchSearch && matchDiv && matchType;
  });

  const featured = filtered.filter((t: any) => t.is_featured);
  const rest = filtered.filter((t: any) => !t.is_featured);

  const divisions = [...new Set((listings as any[]).map((t: any) => t.division).filter(Boolean))] as string[];
  const programTypes = [...new Set((listings as any[]).map((t: any) => t.program_type).filter(Boolean))] as string[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Rowing Club Directory</h2>
          <p className="text-sm text-muted-foreground mt-0.5">All programs using CrewSync</p>
        </div>
        <a
          href="/directory"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Public page
        </a>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search programs, locations, coaches..."
            className="pl-9"
          />
        </div>
        <Select value={divisionFilter} onValueChange={setDivisionFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Division" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Divisions</SelectItem>
            {divisions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Program Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {programTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No programs found</p>
          <p className="text-sm mt-1 opacity-70">Opt in from your Team Settings to appear here</p>
        </div>
      ) : (
        <div className="space-y-8">
          {featured.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Star className="h-4 w-4 text-[#f59e0b]" fill="currentColor" />
                <h3 className="font-semibold text-foreground">Featured Programs</h3>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {featured.map((p: any) => <ProgramCard key={p.id} program={p} featured />)}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-foreground mb-4">
              All Programs
              <span className="ml-2 text-sm font-normal text-muted-foreground">({rest.length})</span>
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rest.map((p: any) => <ProgramCard key={p.id} program={p} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgramCard({ program, featured }: { program: any; featured?: boolean }) {
  return (
    <Card className={`relative overflow-hidden transition-all hover:shadow-card-hover ${
      featured ? "border-[#2d6be4]/30 bg-gradient-to-br from-primary/5 to-transparent" : ""
    }`}>
      {featured && (
        <div className="absolute top-3 right-3">
          <Star className="h-4 w-4 text-[#f59e0b]" fill="currentColor" />
        </div>
      )}
      <CardContent className="p-5 space-y-3">
        <div>
          <h4 className="font-bold text-foreground leading-tight">{program.name}</h4>
          {program.location && (
            <div className="flex items-center gap-1 mt-1 text-muted-foreground text-sm">
              <MapPin className="h-3.5 w-3.5" />
              {program.location}
            </div>
          )}
        </div>

        {program.description && (
          <p className="text-muted-foreground text-sm line-clamp-2">{program.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {program.division && (
            <Badge variant="secondary" className="text-xs">{program.division}</Badge>
          )}
          {program.program_type && (
            <Badge className="bg-primary/10 text-primary border-none text-xs">{program.program_type}</Badge>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Coach</p>
            <p className="font-medium text-foreground">{program.coachName}</p>
          </div>
          {program.athlete_count > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {program.athlete_count}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
