import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { RecruitFilters } from "./types";

const CURRENT_YEAR = new Date().getFullYear();
const GRAD_YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, CURRENT_YEAR + 4];

interface Props {
  filters: RecruitFilters;
  onChange: (f: RecruitFilters) => void;
}

export function RecruitFilterPanel({ filters, onChange }: Props) {
  const set = (key: keyof RecruitFilters, value: any) => onChange({ ...filters, [key]: value });

  const toggleGradYear = (year: number) => {
    const next = filters.gradYears.includes(year)
      ? filters.gradYears.filter((y) => y !== year)
      : [...filters.gradYears, year];
    set("gradYears", next);
  };

  const reset = () =>
    onChange({
      gradYears: [],
      divisionInterest: "",
      location: "",
      twoKMin: "",
      twoKMax: "",
      heightMinCm: "",
      heightMaxCm: "",
      weightMinKg: "",
      weightMaxKg: "",
      hasCombineScore: false,
      searchQuery: "",
    });

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Name or school..."
          value={filters.searchQuery}
          onChange={(e) => set("searchQuery", e.target.value)}
          className="pl-9"
        />
        {filters.searchQuery && (
          <button onClick={() => set("searchQuery", "")} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Grad Year */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Grad Year</Label>
        <div className="flex flex-wrap gap-1.5">
          {GRAD_YEARS.map((y) => (
            <button
              key={y}
              onClick={() => toggleGradYear(y)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                filters.gradYears.includes(y)
                  ? "bg-primary text-white border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Division Interest */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Division Interest</Label>
        <Select value={filters.divisionInterest} onValueChange={(v) => set("divisionInterest", v === "_all" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Any division" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Any division</SelectItem>
            <SelectItem value="D1">D1</SelectItem>
            <SelectItem value="D2">D2</SelectItem>
            <SelectItem value="D3">D3</SelectItem>
            <SelectItem value="NAIA">NAIA</SelectItem>
            <SelectItem value="Club">Club</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 2k Time Range */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Best 2k (m:ss)</Label>
        <div className="flex items-center gap-2">
          <Input
            placeholder="5:30"
            value={filters.twoKMin}
            onChange={(e) => set("twoKMin", e.target.value)}
            className="h-8 text-xs"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            placeholder="7:00"
            value={filters.twoKMax}
            onChange={(e) => set("twoKMax", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Height Range */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Height (cm)</Label>
        <div className="flex items-center gap-2">
          <Input placeholder="160" value={filters.heightMinCm} onChange={(e) => set("heightMinCm", e.target.value)} className="h-8 text-xs" />
          <span className="text-muted-foreground text-xs">–</span>
          <Input placeholder="210" value={filters.heightMaxCm} onChange={(e) => set("heightMaxCm", e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      {/* Weight Range */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Weight (kg)</Label>
        <div className="flex items-center gap-2">
          <Input placeholder="55" value={filters.weightMinKg} onChange={(e) => set("weightMinKg", e.target.value)} className="h-8 text-xs" />
          <span className="text-muted-foreground text-xs">–</span>
          <Input placeholder="110" value={filters.weightMaxKg} onChange={(e) => set("weightMaxKg", e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      {/* Location */}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Location</Label>
        <Input placeholder="City, State, or Region" value={filters.location} onChange={(e) => set("location", e.target.value)} className="h-8 text-xs" />
      </div>

      {/* Has Combine Score */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Has VCS</Label>
        <Switch checked={filters.hasCombineScore} onCheckedChange={(v) => set("hasCombineScore", v)} />
      </div>

      <Button variant="ghost" size="sm" onClick={reset} className="w-full text-xs text-muted-foreground">
        <X className="h-3.5 w-3.5 mr-1" /> Clear filters
      </Button>
    </div>
  );
}
