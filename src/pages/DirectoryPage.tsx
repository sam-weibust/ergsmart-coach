import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Star, Search, ArrowRight, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import crewsyncLogo from "@/assets/crewsync-logo-icon.jpg";

export default function DirectoryPage() {
  const navigate = useNavigate();
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
        .order("is_featured", { ascending: false })
        .order("athlete_count", { ascending: false });

      if (!teams || teams.length === 0) return [];

      const coachIds = [...new Set(teams.map((t: any) => t.coach_id).filter(Boolean))];
      let coachMap: Record<string, string> = {};

      if (coachIds.length > 0) {
        const { data: coaches } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", coachIds);
        if (coaches) {
          coachMap = Object.fromEntries(coaches.map((c: any) => [c.id, c.full_name]));
        }
      }

      return teams.map((t: any) => ({
        ...t,
        coachName: coachMap[t.coach_id] || "Unknown Coach",
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = listings.filter((t: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.name?.toLowerCase().includes(q) || t.location?.toLowerCase().includes(q) || t.coachName?.toLowerCase().includes(q);
    const matchDiv = divisionFilter === "all" || t.division === divisionFilter;
    const matchType = typeFilter === "all" || t.program_type === typeFilter;
    return matchSearch && matchDiv && matchType;
  });

  const featured = filtered.filter((t: any) => t.is_featured);
  const rest = filtered.filter((t: any) => !t.is_featured);

  const divisions = [...new Set(listings.map((t: any) => t.division).filter(Boolean))] as string[];
  const programTypes = [...new Set(listings.map((t: any) => t.program_type).filter(Boolean))] as string[];

  return (
    <>
      <head>
        <title>Rowing Club & Program Directory | CrewSync</title>
        <meta name="description" content="Find rowing clubs and programs using CrewSync. Browse programs by location, division, and type." />
        <meta property="og:title" content="Rowing Club & Program Directory | CrewSync" />
        <meta property="og:description" content="Browse all rowing programs using CrewSync — filter by location, division, and program type." />
        <meta name="robots" content="index, follow" />
      </head>

      <div className="min-h-screen bg-[#0a1628]">
        {/* Header */}
        <header className="border-b border-white/10 bg-[#0a1628] sticky top-0 z-20">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
              <img src={crewsyncLogo} alt="CrewSync" className="h-9 w-9 rounded-xl border border-white/20" />
              <span className="font-bold text-white text-lg">CrewSync</span>
            </div>
            <Button
              onClick={() => navigate("/auth")}
              className="bg-[#2d6be4] hover:bg-[#1e55c4] text-white"
              size="sm"
            >
              Sign In
            </Button>
          </div>
        </header>

        {/* Hero */}
        <div className="bg-gradient-to-b from-[#112240] to-[#0a1628] py-16 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Rowing Club Directory
            </h1>
            <p className="text-white/60 text-lg mb-10 max-w-xl mx-auto">
              Browse rowing programs and clubs using CrewSync across the country
            </p>

            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-3xl mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search programs, locations, coaches..."
                  className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-[#2d6be4]"
                />
              </div>
              <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                <SelectTrigger className="w-full sm:w-40 bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Divisions</SelectItem>
                  {divisions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-44 bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="Program Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {programTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="container mx-auto max-w-5xl px-4 py-12">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#2d6be4] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-white/40">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg">No programs found</p>
              <p className="text-sm mt-2">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="space-y-10">
              {/* Featured */}
              {featured.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-5">
                    <Star className="h-5 w-5 text-[#f59e0b]" fill="currentColor" />
                    <h2 className="text-xl font-bold text-white">Featured Programs</h2>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featured.map((program: any) => (
                      <ProgramCard key={program.id} program={program} featured />
                    ))}
                  </div>
                </section>
              )}

              {/* All programs */}
              <section>
                <h2 className="text-xl font-bold text-white mb-5">
                  All Programs
                  <span className="ml-3 text-sm font-normal text-white/50">({rest.length} listings)</span>
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rest.map((program: any) => (
                    <ProgramCard key={program.id} program={program} />
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* CTA */}
          <div className="mt-16 rounded-2xl bg-gradient-to-r from-[#2d6be4] to-[#1e55c4] p-8 text-center">
            <h3 className="text-2xl font-bold text-white mb-2">List Your Program</h3>
            <p className="text-white/70 mb-6">Join CrewSync and opt in to the directory from your team settings.</p>
            <Button onClick={() => navigate("/auth")} className="bg-white text-[#2d6be4] hover:bg-white/90 font-semibold">
              Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        <footer className="border-t border-white/10 py-8 text-center text-white/30 text-sm">
          © {new Date().getFullYear()} CrewSync. All rights reserved.
        </footer>
      </div>
    </>
  );
}

function ProgramCard({ program, featured }: { program: any; featured?: boolean }) {
  return (
    <div className={`relative rounded-2xl border p-5 transition-all hover:scale-[1.02] cursor-pointer group ${
      featured
        ? "bg-gradient-to-br from-[#2d6be4]/20 to-[#112240] border-[#2d6be4]/40"
        : "bg-white/5 border-white/10 hover:border-white/20"
    }`}>
      {featured && (
        <div className="absolute top-3 right-3">
          <Star className="h-4 w-4 text-[#f59e0b]" fill="currentColor" />
        </div>
      )}
      <div className="space-y-3">
        <div>
          <h3 className="font-bold text-white text-lg leading-tight">{program.name}</h3>
          {program.location && (
            <div className="flex items-center gap-1 mt-1 text-white/50 text-sm">
              <MapPin className="h-3.5 w-3.5" />
              {program.location}
            </div>
          )}
        </div>

        {program.description && (
          <p className="text-white/60 text-sm line-clamp-2">{program.description}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {program.division && (
            <Badge className="bg-white/10 text-white/70 border-none text-xs">{program.division}</Badge>
          )}
          {program.program_type && (
            <Badge className="bg-[#2d6be4]/20 text-[#2d6be4] border-none text-xs">{program.program_type}</Badge>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="space-y-0.5">
            <p className="text-white/40 text-xs">Coach</p>
            <p className="text-white text-sm font-medium">{program.coachName}</p>
          </div>
          {program.athlete_count > 0 && (
            <div className="flex items-center gap-1.5 text-white/50 text-sm">
              <Users className="h-4 w-4" />
              {program.athlete_count} athletes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
