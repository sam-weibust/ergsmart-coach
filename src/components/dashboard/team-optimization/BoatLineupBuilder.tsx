import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Ship, Loader2, Wand2, Save, GripVertical, Trash2, Send, CheckCircle, XCircle, Clock, HelpCircle, BookTemplate, FolderOpen } from "lucide-react";
import { BOAT_CLASSES, BOAT_SEAT_COUNTS, HAS_COX, displayName } from "./constants";

interface Props {
  teamId: string;
  teamName: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  seasonId?: string | null;
  boats?: any[];
}

interface SeatAssignment {
  seat_number: number;
  user_id: string | null;
  name: string;
  rationale?: string;
}

function AttendanceDot({ status }: { status: string }) {
  if (status === "yes") return <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" title="Confirmed" />;
  if (status === "no") return <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" title="Declined" />;
  if (status === "maybe") return <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 inline-block" title="Maybe" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-gray-400 inline-block" title="No response" />;
}

function SortableSeat({ seat, athletes, coxswains, onAthleteChange }: {
  seat: SeatAssignment;
  athletes: any[];
  coxswains: any[];
  onAthleteChange: (seatNum: number, userId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(seat.seat_number) });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const pool = seat.seat_number === 0 ? coxswains : athletes;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2.5 rounded-lg border bg-card min-h-[52px]">
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground p-1 min-w-[44px] min-h-[44px] flex items-center justify-center">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-16 text-sm font-medium text-muted-foreground shrink-0">
        {seat.seat_number === 0 ? "Cox" : `Seat ${seat.seat_number}`}
      </div>
      <Select value={seat.user_id || "none"} onValueChange={v => onAthleteChange(seat.seat_number, v === "none" ? "" : v)}>
        <SelectTrigger className="min-h-[44px] text-sm">
          <SelectValue placeholder={seat.seat_number === 0 ? "Coxswain only" : "Unassigned"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {pool.length === 0 && seat.seat_number === 0 && (
            <SelectItem value="__none_cox__" disabled>No coxswains on roster</SelectItem>
          )}
          {pool.map(a => (
            <SelectItem key={a.id} value={String(a.id)}>{displayName(a)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {seat.rationale && (
        <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={seat.rationale}>{seat.rationale}</span>
      )}
    </div>
  );
}

const BoatLineupBuilder = ({ teamId, teamMembers, isCoach, profile, seasonId, boats = [] }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor));

  const [createOpen, setCreateOpen] = useState(false);
  const [editingLineup, setEditingLineup] = useState<any | null>(null);
  const [newName, setNewName] = useState("");
  const [newBoatClass, setNewBoatClass] = useState<string>("8+");
  const [selectedBoatId, setSelectedBoatId] = useState<string>("");
  const [practiceDate, setPracticeDate] = useState(new Date().toISOString().split("T")[0]);
  const [practiceTime, setPracticeTime] = useState("07:00");
  const [seats, setSeats] = useState<SeatAssignment[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [balanceScore, setBalanceScore] = useState<number | null>(null);
  const [aiRationale, setAiRationale] = useState<string>("");
  const [workoutPlan, setWorkoutPlan] = useState<string>("");
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false);

  const allAthletes = teamMembers.map((m: any) => m.profile || m).filter((a: any) => a?.id);
  // role-based filtering: coxswain seat gets only coxswains, rowing seats get athletes (not coaches)
  const coxswains = allAthletes.filter((a: any) => a.role === "coxswain" || a.is_coxswain);
  const rowers = allAthletes.filter((a: any) => a.role !== "coach");
  const activeBoats = boats.filter((b: any) => b.is_active);

  const { data: templates = [] } = useQuery({
    queryKey: ["lineup-templates", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lineup_templates" as any)
        .select("*")
        .eq("team_id", teamId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lineups = [], isLoading } = useQuery({
    queryKey: ["boat-lineups", teamId, seasonId],
    queryFn: async () => {
      let q = supabase
        .from("boat_lineups")
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      if (seasonId) q = q.eq("season_id", seasonId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Wellness check-ins for published lineup dates (coach view)
  const publishedLineups = lineups.filter((l: any) => l.published_at);
  const practiceDates = [...new Set(publishedLineups.map((l: any) => l.practice_date).filter(Boolean))];
  const athleteIds = [...new Set(publishedLineups.flatMap((l: any) => {
    const seats: any[] = Array.isArray(l.seats) ? l.seats : [];
    return seats.filter(s => s.user_id).map(s => s.user_id);
  }))];

  const { data: wellnessMap = {} } = useQuery({
    queryKey: ["lineup-wellness", teamId, practiceDates.join(",")],
    queryFn: async () => {
      if (!isCoach || practiceDates.length === 0 || athleteIds.length === 0) return {};
      const { data } = await supabase
        .from("wellness_checkins" as any)
        .select("user_id, checkin_date, energy, soreness, sleep_hours")
        .in("user_id", athleteIds)
        .in("checkin_date", practiceDates);
      const map: Record<string, Record<string, any>> = {};
      for (const w of data || []) {
        if (!map[w.checkin_date]) map[w.checkin_date] = {};
        map[w.checkin_date][w.user_id] = w;
      }
      return map;
    },
    enabled: isCoach && publishedLineups.length > 0,
  });

  const { data: attendanceMap = {} } = useQuery({
    queryKey: ["practice-attendance", teamId],
    queryFn: async () => {
      const publishedIds = lineups.filter((l: any) => l.published_at).map((l: any) => l.id);
      if (publishedIds.length === 0) return {};
      const { data, error } = await supabase
        .from("practice_attendance")
        .select("*")
        .in("lineup_id", publishedIds);
      if (error) throw error;
      const map: Record<string, any[]> = {};
      for (const row of data || []) {
        if (!map[row.lineup_id]) map[row.lineup_id] = [];
        map[row.lineup_id].push(row);
      }
      return map;
    },
    enabled: lineups.length > 0,
  });

  function initSeats(boatClass: string) {
    const count = BOAT_SEAT_COUNTS[boatClass] || 8;
    const hasCox = HAS_COX[boatClass];
    const newSeats: SeatAssignment[] = [];
    if (hasCox) {
      newSeats.push({ seat_number: 0, user_id: null, name: "Cox" });
    }
    const rowerCount = hasCox ? count - 1 : count;
    for (let i = 1; i <= rowerCount; i++) {
      newSeats.push({ seat_number: i, user_id: null, name: `Seat ${i}` });
    }
    return newSeats;
  }

  function openCreate() {
    setNewName("");
    setNewBoatClass("8+");
    setSelectedBoatId("");
    setPracticeDate(new Date().toISOString().split("T")[0]);
    setPracticeTime("07:00");
    setSeats(initSeats("8+"));
    setBalanceScore(null);
    setAiRationale("");
    setWorkoutPlan("");
    setEditingLineup(null);
    setCreateOpen(true);
  }

  function openEdit(lineup: any) {
    setNewName(lineup.name);
    setNewBoatClass(lineup.boat_class);
    setSelectedBoatId(lineup.boat_id || "");
    setPracticeDate(lineup.practice_date || new Date().toISOString().split("T")[0]);
    setPracticeTime(lineup.practice_start_time ? lineup.practice_start_time.slice(0, 5) : "07:00");
    const savedSeats: SeatAssignment[] = Array.isArray(lineup.seats) ? lineup.seats : [];
    const basedSeats = initSeats(lineup.boat_class).map(s => {
      const saved = savedSeats.find((ss: any) => ss.seat_number === s.seat_number);
      return saved ? { ...s, ...saved } : s;
    });
    setSeats(basedSeats);
    setBalanceScore(null);
    setAiRationale(lineup.ai_rationale || "");
    setWorkoutPlan(lineup.workout_plan || "");
    setEditingLineup(lineup);
    setCreateOpen(true);
  }

  function handleBoatSelect(boatId: string) {
    setSelectedBoatId(boatId);
    const boat = activeBoats.find((b: any) => b.id === boatId);
    if (boat) {
      setNewBoatClass(boat.boat_class);
      setSeats(initSeats(boat.boat_class));
    }
    setBalanceScore(null);
    setAiRationale("");
  }

  function handleBoatClassChange(bc: string) {
    setNewBoatClass(bc);
    setSeats(initSeats(bc));
    setBalanceScore(null);
    setAiRationale("");
  }

  function handleAthleteChange(seatNum: number, userId: string) {
    const cleanId = userId && userId !== "none" ? userId : null;
    setSeats(prev => prev.map(s => s.seat_number === seatNum ? {
      ...s,
      user_id: cleanId,
      name: cleanId ? displayName(allAthletes.find((a: any) => a.id === cleanId)) : "",
    } : s));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSeats(prev => {
      const oldIndex = prev.findIndex(s => String(s.seat_number) === active.id);
      const newIndex = prev.findIndex(s => String(s.seat_number) === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function suggestLineup() {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-boat-lineup", {
        body: { team_id: teamId, boat_class: newBoatClass, athlete_pool: allAthletes, locked_seats: [] },
      });
      if (error) throw new Error(error.message);
      if (data?.seats) {
        const updatedSeats = initSeats(newBoatClass).map(s => {
          if (s.seat_number === 0 && data.cox) {
            return { ...s, user_id: data.cox.user_id, name: data.cox.name || "", rationale: data.cox.rationale };
          }
          const suggested = (data.seats ?? []).find((ss: any) => ss.seat_number === s.seat_number);
          return suggested ? { ...s, user_id: suggested.user_id, name: suggested.name || "", rationale: suggested.rationale } : s;
        });
        setSeats(updatedSeats);
        setBalanceScore(data.balance_score ?? null);
        setAiRationale(data.overall_rationale || "");
        toast({ title: "AI lineup suggested!" });
      }
    } catch (e: any) {
      toast({ title: "AI Error", description: e.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  const saveLineup = useMutation({
    mutationFn: async () => {
      const boat = activeBoats.find((b: any) => b.id === selectedBoatId);
      const resolvedBoatClass = boat ? boat.boat_class : newBoatClass;
      const payload = {
        team_id: teamId,
        name: newName || (boat ? boat.name : "Lineup"),
        boat_class: resolvedBoatClass,
        boat_id: selectedBoatId || null,
        season_id: seasonId || null,
        seats,
        practice_date: practiceDate || null,
        practice_start_time: practiceTime || null,
        ai_suggestion_used: !!aiRationale,
        ai_rationale: aiRationale || null,
        workout_plan: workoutPlan || null,
        updated_at: new Date().toISOString(),
        created_by: profile.id,
      };
      if (editingLineup) {
        const { error } = await supabase.from("boat_lineups").update(payload).eq("id", editingLineup.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("boat_lineups").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingLineup ? "Lineup updated!" : "Lineup saved!" });
      queryClient.invalidateQueries({ queryKey: ["boat-lineups", teamId] });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const publishLineup = useMutation({
    mutationFn: async (lineup: any) => {
      const seatsArr: SeatAssignment[] = Array.isArray(lineup.seats) ? lineup.seats : [];
      const athleteIds = seatsArr.filter(s => s.user_id).map(s => s.user_id!);

      // Mark as published
      const { error: pubErr } = await supabase.from("boat_lineups").update({
        published_at: new Date().toISOString(),
        status: "final",
      }).eq("id", lineup.id);
      if (pubErr) throw pubErr;

      // Create attendance records for each athlete
      if (athleteIds.length > 0) {
        const records = athleteIds.map(uid => ({
          lineup_id: lineup.id,
          user_id: uid,
          status: "no_response",
        }));
        await supabase.from("practice_attendance").upsert(records, { onConflict: "lineup_id,user_id" });

        // Send push + in-app notifications
        const dateStr = lineup.practice_date ? new Date(lineup.practice_date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "upcoming practice";
        supabase.functions.invoke("send-notification", {
          body: {
            user_ids: athleteIds,
            type: "lineup_published",
            title: "Lineup Posted",
            body: `Your lineup for ${dateStr} has been posted. Tap to view your seat.`,
            data: { lineup_id: lineup.id, action: "attendance" },
          },
        }).catch((e) => console.error("send-notification error:", e));
      }

      // Auto-create practice entry if it doesn't already exist
      if (lineup.practice_date) {
        const { data: existingEntry } = await supabase
          .from("practice_entries")
          .select("id")
          .eq("lineup_id", lineup.id)
          .maybeSingle();
        if (!existingEntry) {
          await supabase.from("practice_entries").insert({
            team_id: lineup.team_id,
            lineup_id: lineup.id,
            practice_date: lineup.practice_date,
            boat_id: lineup.boat_id || null,
            status: "pending",
          } as any);
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Lineup published! Athletes notified." });
      queryClient.invalidateQueries({ queryKey: ["boat-lineups", teamId] });
      queryClient.invalidateQueries({ queryKey: ["practice-attendance", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const overrideAttendance = useMutation({
    mutationFn: async ({ lineupId, userId, status }: { lineupId: string; userId: string; status: string }) => {
      const { error } = await supabase.from("practice_attendance").upsert({
        lineup_id: lineupId,
        user_id: userId,
        status,
        responded_at: new Date().toISOString(),
        overridden_by: profile.id,
      }, { onConflict: "lineup_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practice-attendance", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLineup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("boat_lineups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Lineup deleted" });
      queryClient.invalidateQueries({ queryKey: ["boat-lineups", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveTemplate = useMutation({
    mutationFn: async ({ name, overwriteId }: { name: string; overwriteId?: string }) => {
      const payload = {
        team_id: teamId,
        coach_id: profile.id,
        name,
        boat_id: selectedBoatId || null,
        boat_class: newBoatClass,
        seats,
        updated_at: new Date().toISOString(),
      };
      if (overwriteId) {
        const { error } = await supabase.from("lineup_templates" as any).update(payload).eq("id", overwriteId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lineup_templates" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Template saved!" });
      queryClient.invalidateQueries({ queryKey: ["lineup-templates", teamId] });
      setSaveTemplateOpen(false);
      setTemplateName("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lineup_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Template deleted" });
      queryClient.invalidateQueries({ queryKey: ["lineup-templates", teamId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function loadTemplate(template: any) {
    setNewBoatClass(template.boat_class);
    setSelectedBoatId(template.boat_id || "");
    const templateSeats: SeatAssignment[] = Array.isArray(template.seats) ? template.seats : [];
    const baseSeats = initSeats(template.boat_class).map((s: SeatAssignment) => {
      const saved = templateSeats.find((ts: any) => ts.seat_number === s.seat_number);
      return saved ? { ...s, ...saved } : s;
    });
    setSeats(baseSeats);
    setLoadTemplateOpen(false);
    toast({ title: `Loaded template: ${template.name}` });
  }

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Boat Lineup Builder</h2>
          <p className="text-sm text-muted-foreground">Create and manage boat lineups with AI assistance</p>
        </div>
        {isCoach && (
          <Button size="sm" className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" />New Lineup</Button>
        )}
      </div>

      <Tabs defaultValue="lineups">
        <TabsList className="mb-4">
          <TabsTrigger value="lineups">Lineups</TabsTrigger>
          <TabsTrigger value="templates">
            Templates
            {templates.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{templates.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <div className="space-y-3">
            {templates.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <BookTemplate className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No templates yet. Save a lineup as a template to reuse it.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {templates.map((t: any) => {
                  const tSeats: SeatAssignment[] = Array.isArray(t.seats) ? t.seats : [];
                  const filled = tSeats.filter(s => s.user_id).length;
                  return (
                    <Card key={t.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-sm">{t.name}</CardTitle>
                            <CardDescription className="flex items-center gap-1.5 mt-1">
                              <Badge variant="outline" className="text-xs">{t.boat_class}</Badge>
                              <span className="text-xs text-muted-foreground">{filled} athletes</span>
                              <span className="text-xs text-muted-foreground">
                                Last used {new Date(t.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            </CardDescription>
                          </div>
                          {isCoach && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => { openCreate(); loadTemplate(t); }}>
                                <FolderOpen className="h-3 w-3" />Load
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteTemplate.mutate(t.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {tSeats.slice(0, 4).map((s: any) => (
                          <div key={s.seat_number} className="flex gap-2 text-xs py-0.5">
                            <span className="text-muted-foreground w-12 shrink-0">{s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`}</span>
                            <span className="font-medium">{s.name || "—"}</span>
                          </div>
                        ))}
                        {tSeats.length > 4 && <p className="text-xs text-muted-foreground mt-1">+{tSeats.length - 4} more</p>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="lineups">
      {lineups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Ship className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No lineups yet. Create your first boat lineup.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lineups.map((lineup: any) => {
            const seatsArr: SeatAssignment[] = Array.isArray(lineup.seats) ? lineup.seats : [];
            const filledSeats = seatsArr.filter(s => s.user_id).length;
            const attendance: any[] = attendanceMap[lineup.id] || [];
            const confirmed = attendance.filter(a => a.status === "yes").length;
            const declined = attendance.filter(a => a.status === "no").length;
            const maybe = attendance.filter(a => a.status === "maybe").length;
            const noResp = attendance.filter(a => a.status === "no_response").length;
            const showAttendance = !!lineup.published_at && attendance.length > 0;

            return (
              <Card key={lineup.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{lineup.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                        {lineup.boat_id && boats.find((b: any) => b.id === lineup.boat_id) && (
                          <Badge className="bg-blue-600 text-white text-xs">{boats.find((b: any) => b.id === lineup.boat_id).name}</Badge>
                        )}
                        <Badge variant="outline">{lineup.boat_class}</Badge>
                        <Badge variant={lineup.status === "final" ? "default" : "secondary"}>{lineup.status || "draft"}</Badge>
                        {lineup.ai_suggestion_used && <Badge variant="outline" className="gap-1 text-xs"><Wand2 className="h-3 w-3" />AI</Badge>}
                        {lineup.published_at && <Badge className="bg-green-600 text-white text-xs">Published</Badge>}
                        {lineup.practice_date && <span className="text-xs text-muted-foreground">{new Date(lineup.practice_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>}
                      </CardDescription>
                    </div>
                    {isCoach && (
                      <div className="flex gap-1 flex-wrap justify-end">
                        {!lineup.published_at && (
                          <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2" onClick={() => publishLineup.mutate(lineup)} disabled={publishLineup.isPending}>
                            <Send className="h-3 w-3" />Publish
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(lineup)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => deleteLineup.mutate(lineup.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-2">{filledSeats}/{seatsArr.length} seats filled</div>

                  {/* Attendance summary */}
                  {showAttendance && (
                    <div className="mb-3 p-2 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{confirmed}</span>
                        <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" />{declined}</span>
                        <span className="flex items-center gap-1"><HelpCircle className="h-3 w-3 text-yellow-500" />{maybe}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-gray-400" />{noResp}</span>
                      </div>
                      {/* Per-athlete indicators */}
                      <div className="flex flex-wrap gap-1.5">
                        {seatsArr.filter(s => s.user_id).map(s => {
                          const rec = attendance.find(a => a.user_id === s.user_id);
                          const status = rec?.status || "no_response";
                          const wellness = lineup.practice_date
                            ? (wellnessMap as any)[lineup.practice_date]?.[s.user_id!]
                            : null;
                          const lowEnergy = wellness?.energy != null && wellness.energy < 5;
                          const highSoreness = wellness?.soreness != null && wellness.soreness > 7;
                          const poorSleep = wellness?.sleep_hours != null && wellness.sleep_hours < 6;
                          const hasFlag = lowEnergy || highSoreness || poorSleep;
                          return (
                            <div key={s.seat_number} className="flex items-center gap-1">
                              <AttendanceDot status={status} />
                              <span className="text-[11px]">{s.name || "?"}</span>
                              {isCoach && hasFlag && (
                                <span
                                  title={[
                                    lowEnergy ? `⚡ Energy: ${wellness.energy}/10` : null,
                                    highSoreness ? `💪 Soreness: ${wellness.soreness}/10` : null,
                                    poorSleep ? `😴 Sleep: ${wellness.sleep_hours}h` : null,
                                  ].filter(Boolean).join(" | ")}
                                  className="text-amber-500 text-[10px]">⚠</span>
                              )}
                              {isCoach && (
                                <select
                                  className="text-[10px] border rounded px-0.5 py-0 bg-background"
                                  value={status}
                                  onChange={e => overrideAttendance.mutate({ lineupId: lineup.id, userId: s.user_id!, status: e.target.value })}
                                >
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                  <option value="maybe">Maybe</option>
                                  <option value="no_response">—</option>
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {seatsArr.slice(0, 4).map((s: any) => (
                    <div key={s.seat_number} className="flex gap-2 text-xs py-0.5">
                      <span className="text-muted-foreground w-12 shrink-0">{s.seat_number === 0 ? "Cox" : `Seat ${s.seat_number}`}</span>
                      <span className="font-medium">{s.name || s.user_id || "—"}</span>
                    </div>
                  ))}
                  {seatsArr.length > 4 && <p className="text-xs text-muted-foreground mt-1">+{seatsArr.length - 4} more seats</p>}
                  {lineup.published_at && lineup.workout_plan && (
                    <div className="mt-3 p-2 rounded bg-muted/50 border-l-2 border-primary/40">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">WORKOUT</p>
                      <p className="text-xs whitespace-pre-wrap line-clamp-4">{lineup.workout_plan}</p>
                    </div>
                  )}
                  {lineup.ai_rationale && (
                    <p className="text-xs text-muted-foreground mt-2 italic line-clamp-2">{lineup.ai_rationale}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLineup ? "Edit Lineup" : "New Boat Lineup"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Template actions */}
            {isCoach && templates.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => setLoadTemplateOpen(true)}>
                <FolderOpen className="h-4 w-4" />Load Template
              </Button>
            )}

            <div className="space-y-3">
              {activeBoats.length > 0 && (
                <div className="space-y-1">
                  <Label>Named Boat</Label>
                  <Select value={selectedBoatId || "custom"} onValueChange={v => v === "custom" ? setSelectedBoatId("") : handleBoatSelect(v)}>
                    <SelectTrigger><SelectValue placeholder="Select a boat" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Custom (no named boat)</SelectItem>
                      {activeBoats.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>{b.name} ({b.boat_class})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Lineup Name</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Varsity 8+ Practice" />
                </div>
                <div className="space-y-1">
                  <Label>Boat Class</Label>
                  <Select value={newBoatClass} onValueChange={handleBoatClassChange} disabled={!!selectedBoatId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BOAT_CLASSES.map(bc => <SelectItem key={bc} value={bc}>{bc}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Practice Date</Label>
                  <Input type="date" value={practiceDate} onChange={e => setPracticeDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Practice Time</Label>
                  <Input type="time" value={practiceTime} onChange={e => setPracticeTime(e.target.value)} />
                </div>
              </div>
            </div>

            {isCoach && (
              <Button type="button" variant="outline" className="w-full gap-2" onClick={suggestLineup} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                AI Suggest Lineup
              </Button>
            )}

            {balanceScore !== null && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Balance Score:</span>
                <Badge variant={balanceScore >= 75 ? "default" : balanceScore >= 50 ? "secondary" : "destructive"}>
                  {balanceScore}/100
                </Badge>
              </div>
            )}

            {aiRationale && (
              <p className="text-xs text-muted-foreground italic bg-muted/50 rounded p-2">{aiRationale}</p>
            )}

            {coxswains.length === 0 && HAS_COX[newBoatClass] && (
              <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                No coxswains on your roster yet. Athletes can mark themselves as coxswains in their profile settings.
              </p>
            )}

            <div className="space-y-1">
              <Label>Seat Assignments (drag to reorder)</Label>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={seats.map(s => String(s.seat_number))} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {seats.map(seat => (
                      <SortableSeat
                        key={seat.seat_number}
                        seat={seat}
                        athletes={rowers}
                        coxswains={coxswains}
                        onAthleteChange={handleAthleteChange}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <div className="space-y-1">
              <Label>Workout Plan <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                className="text-sm min-h-[100px] resize-none font-mono"
                placeholder={"e.g.\n4x1000m @ race pace, 2' rest\n3x500m rate 26, 2' rest\nLong row home steady state"}
                value={workoutPlan}
                onChange={e => setWorkoutPlan(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Free-form — write it exactly as you'd put it on the whiteboard. Published with the lineup.</p>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                onClick={() => saveLineup.mutate()}
                disabled={saveLineup.isPending || !newName}
              >
                {saveLineup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingLineup ? "Update Lineup" : "Save Lineup"}
              </Button>
              {isCoach && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => { setTemplateName(newName || ""); setSaveTemplateOpen(true); }}
                >
                  <BookTemplate className="h-4 w-4" />Save as Template
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="e.g. Varsity 8 Race Day"
                autoFocus
              />
            </div>
            {templates.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Or overwrite an existing template:</p>
                {templates.map((t: any) => (
                  <Button
                    key={t.id}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs h-8"
                    onClick={() => saveTemplate.mutate({ name: t.name, overwriteId: t.id })}
                    disabled={saveTemplate.isPending}
                  >
                    Overwrite "{t.name}"
                  </Button>
                ))}
              </div>
            )}
            <Button
              className="w-full gap-2"
              onClick={() => saveTemplate.mutate({ name: templateName })}
              disabled={!templateName.trim() || saveTemplate.isPending}
            >
              {saveTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save New Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load Template Dialog */}
      <Dialog open={loadTemplateOpen} onOpenChange={setLoadTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Load Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {templates.map((t: any) => {
              const tSeats: SeatAssignment[] = Array.isArray(t.seats) ? t.seats : [];
              return (
                <button
                  key={t.id}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted transition-colors"
                  onClick={() => loadTemplate(t)}
                >
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.boat_class} · {tSeats.filter((s: any) => s.user_id).length} athletes ·
                    Updated {new Date(t.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BoatLineupBuilder;
