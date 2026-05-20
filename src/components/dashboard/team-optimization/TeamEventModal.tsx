import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";

export const EVENT_TYPES = [
  { value: "regatta",    label: "Regatta",      color: "#D4AF37" },
  { value: "team_meal",  label: "Team Meal",    color: "#16a34a" },
  { value: "meeting",    label: "Meeting",      color: "#2563eb" },
  { value: "erg_testing",label: "Erg Testing",  color: "#ea580c" },
  { value: "strength",   label: "Strength",     color: "#7c3aed" },
  { value: "rest_day",   label: "Rest Day",     color: "#6b7280" },
  { value: "travel",     label: "Travel",       color: "#0d9488" },
  { value: "other",      label: "Other",        color: "#0a1628" },
] as const;

export type EventType = typeof EVENT_TYPES[number]["value"];

export function getEventColor(type: EventType | string): string {
  return EVENT_TYPES.find(e => e.value === type)?.color ?? "#0a1628";
}

interface Props {
  teamId: string;
  coachId: string;
  initialDate?: string;
  event?: any; // for editing
  isCoach: boolean;
  isHeadCoach?: boolean;
  onClose: () => void;
  boats?: any[];
}

export default function TeamEventModal({ teamId, coachId, initialDate, event, isCoach, isHeadCoach, onClose, boats = [] }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!event;

  const [title, setTitle] = useState(event?.title ?? "");
  const [eventType, setEventType] = useState<EventType>(event?.event_type ?? "other");
  const [date, setDate] = useState(event?.date ?? initialDate ?? "");
  const [startTime, setStartTime] = useState(event?.start_time ?? "");
  const [endTime, setEndTime] = useState(event?.end_time ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [notifyTeam, setNotifyTeam] = useState(event?.notify_team ?? false);
  const [visibleTo, setVisibleTo] = useState<"all" | "coaches_only" | "specific_boat">(
    event?.visible_to?.type ?? "all"
  );
  const [boatId, setBoatId] = useState(event?.visible_to?.boat_id ?? "");
  const [recurring, setRecurring] = useState<"once" | "weekly">(
    event?.is_recurring ? "weekly" : "once"
  );

  const canEdit = isHeadCoach || !isEdit || event?.coach_id === coachId;

  const upsert = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      const payload = {
        team_id: teamId,
        coach_id: coachId,
        title: title.trim(),
        event_type: eventType,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        location: location || null,
        description: description || null,
        notify_team: notifyTeam,
        is_recurring: recurring === "weekly",
        recurrence_rule: recurring === "weekly" ? "FREQ=WEEKLY" : null,
        visible_to: visibleTo === "specific_boat"
          ? { type: "specific_boat", boat_id: boatId }
          : { type: visibleTo },
        updated_at: new Date().toISOString(),
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("team_events").update(payload).eq("id", event.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("team_events").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Event updated" : "Event created" });
      queryClient.invalidateQueries({ queryKey: ["team-events", teamId] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("team_events").delete().eq("id", event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Event deleted" });
      queryClient.invalidateQueries({ queryKey: ["team-events", teamId] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Event" : "Add Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Event Title *</Label>
            <Input
              placeholder="e.g. NEIRA Regatta, Pasta Party, Team Meeting"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Event Type</Label>
              <Select value={eventType} onValueChange={v => setEventType(v as EventType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full inline-block" style={{ background: t.color }} />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Date *</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Time</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Time</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Input placeholder="Optional" value={location} onChange={e => setLocation(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              placeholder="Optional notes..."
              rows={2}
              className="resize-none text-sm"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Visible To</Label>
              <Select value={visibleTo} onValueChange={v => setVisibleTo(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Team</SelectItem>
                  <SelectItem value="coaches_only">Coaches Only</SelectItem>
                  {boats.length > 0 && <SelectItem value="specific_boat">Specific Boat</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Repeats</Label>
              <Select value={recurring} onValueChange={v => setRecurring(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {visibleTo === "specific_boat" && boats.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Select Boat</Label>
              <Select value={boatId} onValueChange={setBoatId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose boat" />
                </SelectTrigger>
                <SelectContent>
                  {boats.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Switch id="notify" checked={notifyTeam} onCheckedChange={setNotifyTeam} />
            <Label htmlFor="notify" className="text-sm cursor-pointer">Notify team members</Label>
          </div>
        </div>

        <DialogFooter className="flex gap-2 justify-between">
          {isEdit && canEdit && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1"
              onClick={() => deleteEvent.mutate()}
              disabled={deleteEvent.isPending}
            >
              {deleteEvent.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => upsert.mutate()}
              disabled={upsert.isPending || !canEdit}
            >
              {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? "Save" : "Add Event"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
