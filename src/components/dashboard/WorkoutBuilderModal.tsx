import { useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Bluetooth, Loader2, Send } from "lucide-react";
import {
  sendWorkoutToPM5, validateWorkoutSpec, MAX_INTERVALS, type WorkoutSpec,
} from "@/lib/pm5Control";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deviceId: string | null;
  coachWorkout?: any;
}

type Kind = WorkoutSpec["kind"];

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "justrow",          label: "Just Row",       hint: "No target — row until you stop" },
  { value: "distance",         label: "Single Distance", hint: "e.g. 2000 m" },
  { value: "time",             label: "Single Time",     hint: "e.g. 30:00" },
  { value: "intervalDistance", label: "Intervals · Distance", hint: "e.g. 4 × 500 m off 2:00" },
  { value: "intervalTime",     label: "Intervals · Time",     hint: "e.g. 4 × 10:00 off 3:00" },
];

// ── Parsing helpers ──────────────────────────────────────────────────────────

/** "mm:ss", "hh:mm:ss" or a bare number of minutes → seconds. */
function parseDurationSeconds(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{1,4}$/.test(t)) return parseInt(t, 10) * 60;
  const m = t.match(/^(\d{1,4}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (!m) return null;
  if (m[3] !== undefined) {
    return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  }
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function parsePositiveInt(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── Coach workout ────────────────────────────────────────────────────────────

interface CoachDraft {
  kind: Kind;
  meters?: number;
  seconds?: number;
  count?: number;
  restSeconds?: number;
}

/** Best-effort human summary of whatever shape `coachWorkout` arrives in. */
function coachSummary(cw: any): string {
  try {
    if (cw == null) return "";
    if (typeof cw === "string") return cw.trim();
    if (typeof cw === "number") return String(cw);
    if (typeof cw !== "object") return String(cw);
    const parts = [cw.title, cw.name, cw.workout, cw.description, cw.details, cw.summary, cw.notes]
      .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0);
    if (parts.length) return parts.join(" — ").trim();
    const json = JSON.stringify(cw);
    return json && json !== "{}" ? json : "";
  } catch {
    return "";
  }
}

/**
 * Pull a sendable workout out of a coach-assigned workout. Accepts structured
 * fields when they exist and falls back to free text ("4x500m off 2:00").
 * Returns null when nothing usable can be read — never throws.
 */
function parseCoachWorkout(cw: any): CoachDraft | null {
  try {
    if (cw == null) return null;

    // 1 ─ structured fields
    if (typeof cw === "object") {
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
      const meters = num(cw.distance_meters) ?? num(cw.distance) ?? num(cw.meters);
      const seconds =
        num(cw.duration_seconds) ??
        num(cw.work_seconds) ??
        (num(cw.duration_minutes) ? num(cw.duration_minutes)! * 60 : null);
      const count = num(cw.interval_count) ?? num(cw.intervals) ?? num(cw.reps);
      const rest = num(cw.rest_seconds) ?? (num(cw.rest_minutes) ? num(cw.rest_minutes)! * 60 : null);

      if (count && rest && meters) return { kind: "intervalDistance", count, meters, restSeconds: rest };
      if (count && rest && seconds) return { kind: "intervalTime", count, seconds, restSeconds: rest };
      if (meters) return { kind: "distance", meters };
      if (seconds) return { kind: "time", seconds };
    }

    // 2 ─ free text
    const text = coachSummary(cw);
    if (!text) return null;

    const restMatch =
      text.match(/(?:off|rest|r)\s*[:=]?\s*(\d{1,3}:[0-5]\d)/i) ??
      text.match(/(\d{1,3}:[0-5]\d)\s*(?:rest|off)/i);
    const restText = text.match(/(\d{1,3})\s*(?:min|mins|minutes)\s*(?:rest|off)/i);
    const restSeconds = restMatch
      ? parseDurationSeconds(restMatch[1]) ?? undefined
      : restText
        ? parseInt(restText[1], 10) * 60
        : undefined;

    const intervalDist = text.match(/(\d{1,3})\s*[x×]\s*(\d{2,6})\s*m\b/i);
    if (intervalDist) {
      return {
        kind: "intervalDistance",
        count: parseInt(intervalDist[1], 10),
        meters: parseInt(intervalDist[2], 10),
        restSeconds,
      };
    }

    const intervalClock = text.match(/(\d{1,3})\s*[x×]\s*(\d{1,3}:[0-5]\d)/i);
    if (intervalClock) {
      return {
        kind: "intervalTime",
        count: parseInt(intervalClock[1], 10),
        seconds: parseDurationSeconds(intervalClock[2]) ?? undefined,
        restSeconds,
      };
    }

    const intervalMin = text.match(/(\d{1,3})\s*[x×]\s*(\d{1,3})\s*(?:min|mins|minutes|')/i);
    if (intervalMin) {
      return {
        kind: "intervalTime",
        count: parseInt(intervalMin[1], 10),
        seconds: parseInt(intervalMin[2], 10) * 60,
        restSeconds,
      };
    }

    const singleDist = text.match(/(\d{3,6})\s*m\b/i);
    if (singleDist) return { kind: "distance", meters: parseInt(singleDist[1], 10) };

    const singleMin = text.match(/(\d{1,3})\s*(?:min|mins|minutes)\b/i);
    if (singleMin) return { kind: "time", seconds: parseInt(singleMin[1], 10) * 60 };

    const singleClock = text.match(/\b(\d{1,3}:[0-5]\d)\b/);
    if (singleClock) {
      const seconds = parseDurationSeconds(singleClock[1]);
      if (seconds) return { kind: "time", seconds };
    }

    if (/just\s*row|steady|free\s*row/i.test(text)) return { kind: "justrow" };

    return null;
  } catch {
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WorkoutBuilderModal({ open, onOpenChange, deviceId, coachWorkout }: Props) {
  const { toast } = useToast();
  const isNative = Capacitor.isNativePlatform();

  const [kind, setKind] = useState<Kind>("distance");
  const [distance, setDistance] = useState("2000");
  const [time, setTime] = useState("30:00");
  const [count, setCount] = useState("4");
  const [workDistance, setWorkDistance] = useState("500");
  const [workTime, setWorkTime] = useState("10:00");
  const [rest, setRest] = useState("2:00");
  const [split, setSplit] = useState("");
  const [sending, setSending] = useState(false);

  const summary = useMemo(() => coachSummary(coachWorkout), [coachWorkout]);
  const draft = useMemo(() => parseCoachWorkout(coachWorkout), [coachWorkout]);

  const spec = useMemo<WorkoutSpec>(() => {
    const targetSplitSeconds = split.trim() ? parseDurationSeconds(split) ?? NaN : undefined;
    const base = targetSplitSeconds === undefined ? {} : { targetSplitSeconds };
    switch (kind) {
      case "justrow":
        return { kind: "justrow", ...base };
      case "distance":
        return { kind: "distance", meters: parsePositiveInt(distance) ?? NaN, ...base };
      case "time":
        return { kind: "time", seconds: parseDurationSeconds(time) ?? NaN, ...base };
      case "intervalDistance":
        return {
          kind: "intervalDistance",
          count: parsePositiveInt(count) ?? NaN,
          meters: parsePositiveInt(workDistance) ?? NaN,
          restSeconds: parseDurationSeconds(rest) ?? NaN,
          ...base,
        };
      case "intervalTime":
        return {
          kind: "intervalTime",
          count: parsePositiveInt(count) ?? NaN,
          workSeconds: parseDurationSeconds(workTime) ?? NaN,
          restSeconds: parseDurationSeconds(rest) ?? NaN,
          ...base,
        };
    }
  }, [kind, distance, time, count, workDistance, workTime, rest, split]);

  const validationError = useMemo(() => validateWorkoutSpec(spec), [spec]);
  const canSend = isNative && !!deviceId && !validationError && !sending;

  function applyCoachWorkout() {
    if (!draft) return;
    setKind(draft.kind);
    if (draft.meters) {
      if (draft.kind === "intervalDistance") setWorkDistance(String(draft.meters));
      else setDistance(String(draft.meters));
    }
    if (draft.seconds) {
      if (draft.kind === "intervalTime") setWorkTime(formatDuration(draft.seconds));
      else setTime(formatDuration(draft.seconds));
    }
    if (draft.count) setCount(String(draft.count));
    if (draft.restSeconds) setRest(formatDuration(draft.restSeconds));
  }

  async function handleSend() {
    if (!deviceId || validationError) return;
    setSending(true);
    try {
      await sendWorkoutToPM5(deviceId, spec);
      toast({ title: "Workout sent to PM5. Press the start button to begin." });
      onOpenChange(false);
    } catch (e) {
      console.error("[WorkoutBuilderModal] send failed:", e);
      toast({
        title: "Could not program PM5. Set up your workout on the monitor.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  const isIntervals = kind === "intervalDistance" || kind === "intervalTime";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Build Workout</DialogTitle>
          <DialogDescription className="text-xs">
            Program the workout onto your monitor, then press the PM5's start button.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {summary && (
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Coach workout</p>
              <p className="text-sm break-words">{summary}</p>
              {draft ? (
                <Button variant="outline" size="sm" onClick={applyCoachWorkout}>
                  Use Coach Workout
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Couldn't read this automatically — enter it below.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Workout Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map(k => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  aria-pressed={kind === k.value}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    kind === k.value
                      ? "border-primary bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {KINDS.find(k => k.value === kind)?.hint}
            </p>
          </div>

          {kind === "distance" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Distance (m)</Label>
              <Input
                inputMode="numeric"
                placeholder="2000"
                value={distance}
                onChange={e => setDistance(e.target.value)}
              />
            </div>
          )}

          {kind === "time" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Time (mm:ss)</Label>
              <Input
                inputMode="numeric"
                placeholder="30:00"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          )}

          {isIntervals && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Intervals</Label>
                <Input
                  inputMode="numeric"
                  placeholder="4"
                  value={count}
                  onChange={e => setCount(e.target.value)}
                />
              </div>
              {kind === "intervalDistance" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Work Distance (m)</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="500"
                    value={workDistance}
                    onChange={e => setWorkDistance(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">Work Time (mm:ss)</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="10:00"
                    value={workTime}
                    onChange={e => setWorkTime(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Rest (mm:ss)</Label>
                <Input
                  inputMode="numeric"
                  placeholder="2:00"
                  value={rest}
                  onChange={e => setRest(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Split (mm:ss) — optional</Label>
            <Input
              inputMode="numeric"
              placeholder="2:00"
              value={split}
              onChange={e => setSplit(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Sets how often the monitor takes a split. Leave blank for the PM5 default.
            </p>
          </div>

          {!isNative && (
            <p className="text-xs text-muted-foreground">
              Open the iOS app to send workouts to your PM5.
            </p>
          )}
          {isNative && !deviceId && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bluetooth className="h-3.5 w-3.5" />
              Connect your PM5 first
            </p>
          )}
          {isNative && !!deviceId && validationError && (
            <p className="text-xs text-destructive">{validationError}</p>
          )}
          {isIntervals && (
            <p className="text-xs text-muted-foreground">
              Up to {MAX_INTERVALS} intervals.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="gap-2" onClick={handleSend} disabled={!canSend}>
            {sending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            Send to PM5
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
