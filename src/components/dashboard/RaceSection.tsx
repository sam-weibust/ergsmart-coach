import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Bluetooth, Loader2, Trophy, Users, Timer, Flag, Copy, Search,
  Play, LogOut, AlertCircle, Crown, Medal, Swords, CheckCircle2,
  RotateCcw, Zap, Heart,
} from "lucide-react";

// ── BLE UUIDs (Concept2 PM5) ────────────────────────────────────
const C2_SERVICE     = "ce060000-43e5-11e4-916c-0800200c9a66";
const C2_ROW_SVC     = "ce060030-43e5-11e4-916c-0800200c9a66";
const C2_GEN_STATUS  = "ce060031-43e5-11e4-916c-0800200c9a66";
const C2_ADD_STATUS  = "ce060032-43e5-11e4-916c-0800200c9a66";
const C2_STROKE_DATA = "ce060034-43e5-11e4-916c-0800200c9a66";

// ── BLE Parsers ─────────────────────────────────────────────────
function parseGenStatus(dv: DataView) {
  if (dv.byteLength < 18) return {};
  const elapsedTime  = dv.getUint8(0) | (dv.getUint8(1) << 8) | (dv.getUint8(2) << 16);
  const rawDist      = dv.getUint8(3) | (dv.getUint8(4) << 8) | (dv.getUint8(5) << 16);
  const distance     = rawDist / 10;
  const workoutState = dv.getUint8(8);
  const strokeRate   = dv.byteLength > 14 ? dv.getUint8(14) : 0;
  return { elapsedTime, distance, workoutState, strokeRate };
}
function parseAddStatus(dv: DataView) {
  if (dv.byteLength < 4) return {};
  const splitPace = dv.getUint16(0, true);
  const power     = dv.byteLength >= 6 ? dv.getUint16(4, true) : 0;
  return { splitPace, power };
}
function parseStrokeDataBle(dv: DataView) {
  if (dv.byteLength < 4) return {};
  const driveLength  = dv.getUint8(0);
  const driveTime    = dv.getUint8(1);
  const recoveryTime = dv.byteLength >= 4 ? dv.getUint16(2, true) : 0;
  return { driveLength, driveTime, recoveryTime };
}

// ── Formatters ──────────────────────────────────────────────────
function fmtPace(cs: number | null | undefined): string {
  if (!cs || cs <= 0 || cs > 100000) return "--:--";
  const s = cs / 100;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}
function fmtTime(cs: number | null | undefined): string {
  if (!cs) return "--:--";
  const s = Math.floor(cs / 100);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Types ────────────────────────────────────────────────────────
interface BleData {
  elapsedTime?: number;
  distance?: number;
  workoutState?: number;
  strokeRate?: number;
  splitPace?: number;
  power?: number;
}
interface StrokePoint { dist: number; split: number; spm: number; }
interface RaceRoom {
  id: string; room_code: string; creator_id: string; distance: number; status: string; created_at: string;
}
interface RaceParticipant {
  id: string; room_id: string; user_id: string; display_name: string;
  erg_score_2k: number | null;
  current_split: number | null; current_spm: number | null; current_distance: number | null;
  current_watts: number | null; elapsed_time: number | null;
  finished_at: string | null; finish_time: number | null;
  avg_split: number | null; avg_spm: number | null; stroke_data: StrokePoint[] | null;
  created_at: string;
}
interface QueueEntry {
  id: string; user_id: string; display_name: string; erg_score_2k: number | null; queued_at: string;
}

type AppState = "home" | "waiting" | "countdown" | "racing" | "results" | "matchmaking";

const ATHLETE_COLORS = ["#4ade80","#60a5fa","#f87171","#fbbf24","#a78bfa","#fb923c","#34d399","#e879f9"];
const DISTANCES = [500, 1000, 2000];

// ── Main Component ───────────────────────────────────────────────
export default function RaceSection() {
  const { toast } = useToast();
  const btSupported = typeof navigator !== "undefined" && "bluetooth" in navigator;

  // Auth
  const [myUserId, setMyUserId]   = useState<string | null>(null);
  const [myName, setMyName]       = useState<string>("Athlete");
  const [my2k, setMy2k]           = useState<number | null>(null);

  // BLE
  const [ergConnected, setErgConnected]   = useState(false);
  const [connecting, setConnecting]       = useState(false);
  const ergDeviceRef  = useRef<any>(null);
  const ergServerRef  = useRef<any>(null);
  const bleDataRef    = useRef<BleData>({});
  const strokesRef    = useRef<StrokePoint[]>([]);
  const latestDistRef = useRef(0);
  const latestSplitRef = useRef(0);
  const latestSpmRef  = useRef(0);

  // Race state
  const [appState, setAppState]         = useState<AppState>("home");
  const [room, setRoom]                 = useState<RaceRoom | null>(null);
  const [participants, setParticipants] = useState<RaceParticipant[]>([]);
  const [countdown, setCountdown]       = useState(3);
  const [joinCode, setJoinCode]         = useState("");
  const [customDist, setCustomDist]     = useState("");
  const [selectedDist, setSelectedDist] = useState(2000);
  const [showCustom, setShowCustom]     = useState(false);
  const [results, setResults]           = useState<RaceParticipant[]>([]);
  const [mySaved, setMySaved]           = useState(false);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);

  const roomRef = useRef<RaceRoom | null>(null);
  const uploadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<any>(null);
  const queueChannelRef = useRef<any>(null);
  const inviteChannelRef = useRef<any>(null);
  const finishedRef = useRef(false);
  const appStateRef = useRef<AppState>("home");
  appStateRef.current = appState;

  // ── Load user profile ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("username,full_name").eq("id", user.id).maybeSingle();
      const name = (profile as any)?.username || (profile as any)?.full_name || user.email?.split("@")[0] || "Athlete";
      setMyName(name);
      // Compute best 2k from erg_workouts
      const { data: workouts } = await supabase.from("erg_workouts")
        .select("avg_split, distance, duration")
        .eq("user_id", user.id)
        .eq("distance", 2000)
        .not("avg_split", "is", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (workouts && workouts.length > 0) {
        const best = workouts.reduce((a: any, b: any) => {
          const pa = parseSplitStr(a.avg_split);
          const pb = parseSplitStr(b.avg_split);
          return (pa && pb) ? (pa < pb ? a : b) : (pa ? a : b);
        });
        const cs = parseSplitStr(best.avg_split);
        if (cs) setMy2k(cs);
      }
    })();
  }, []);

  function parseSplitStr(s: string | null): number | null {
    if (!s) return null;
    const m = s.match(/(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return null;
    return Math.round((parseInt(m[1]) * 60 + parseFloat(m[2])) * 100);
  }

  // ── BLE accumulate ────────────────────────────────────────────
  const accumulate = useCallback((d: Partial<BleData>) => {
    bleDataRef.current = { ...bleDataRef.current, ...d };
    if (d.distance !== undefined) latestDistRef.current = d.distance;
    if (d.splitPace !== undefined) latestSplitRef.current = d.splitPace;
    if (d.strokeRate !== undefined) latestSpmRef.current = d.strokeRate;

    if (
      bleDataRef.current.workoutState === 2 &&
      latestSplitRef.current > 0 &&
      latestDistRef.current > 0
    ) {
      const last = strokesRef.current[strokesRef.current.length - 1];
      const pt: StrokePoint = {
        dist: Math.round(latestDistRef.current),
        split: latestSplitRef.current,
        spm: latestSpmRef.current,
      };
      if (!last || last.dist !== pt.dist) {
        strokesRef.current = [...strokesRef.current, pt];
      }
    }
  }, []);

  // ── BLE connect ───────────────────────────────────────────────
  const resubscribeErg = async (server: any) => {
    const svc = await server.getPrimaryService(C2_ROW_SVC);
    try {
      const gc = await svc.getCharacteristic(C2_GEN_STATUS);
      await gc.startNotifications();
      gc.addEventListener("characteristicvaluechanged", (e: any) => accumulate(parseGenStatus(e.target.value)));
    } catch {}
    try {
      const ac = await svc.getCharacteristic(C2_ADD_STATUS);
      await ac.startNotifications();
      ac.addEventListener("characteristicvaluechanged", (e: any) => accumulate(parseAddStatus(e.target.value)));
    } catch {}
    try {
      const sc = await svc.getCharacteristic(C2_STROKE_DATA);
      await sc.startNotifications();
      sc.addEventListener("characteristicvaluechanged", (e: any) => accumulate(parseStrokeDataBle(e.target.value)));
    } catch {}
  };

  const connectErg = useCallback(async () => {
    if (!btSupported) return;
    setConnecting(true);
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [C2_SERVICE] }, { namePrefix: "PM5" }, { namePrefix: "Concept2" }],
        optionalServices: [C2_ROW_SVC],
      });
      device.addEventListener("gattserverdisconnected", async () => {
        setErgConnected(false);
        try {
          const srv = await device.gatt!.connect();
          ergServerRef.current = srv;
          await resubscribeErg(srv);
          setErgConnected(true);
        } catch {
          toast({ title: "Erg Disconnected", description: "Reconnect your PM5 to continue racing.", variant: "destructive" });
        }
      });
      const server = await device.gatt!.connect();
      ergDeviceRef.current = device;
      ergServerRef.current = server;
      await resubscribeErg(server);
      setErgConnected(true);
      toast({ title: "PM5 Connected", description: device.name || "Concept2 PM5" });
    } catch (e: any) {
      if (e.name !== "NotFoundError") {
        toast({ title: "Connection Failed", description: e.message, variant: "destructive" });
      }
    } finally {
      setConnecting(false);
    }
  }, [btSupported, accumulate]);

  const disconnectErg = useCallback(() => {
    try { ergDeviceRef.current?.gatt?.disconnect(); } catch {}
    setErgConnected(false);
    ergDeviceRef.current = null;
  }, []);

  // ── Supabase room subscription ────────────────────────────────
  const subscribeToRoom = useCallback((roomId: string) => {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); }

    channelRef.current = supabase.channel(`race_room_${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "race_rooms", filter: `id=eq.${roomId}` },
        (payload: any) => {
          const updated = payload.new as RaceRoom;
          setRoom(updated);
          roomRef.current = updated;
          if (updated.status === "countdown" && appStateRef.current === "waiting") {
            setAppState("countdown");
            setCountdown(3);
          }
          if (updated.status === "finished" && appStateRef.current === "racing") {
            fetchAndShowResults(roomId);
          }
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "race_participants", filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          setParticipants(prev => {
            if (prev.find(p => p.id === payload.new.id)) return prev;
            return [...prev, payload.new as RaceParticipant];
          });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "race_participants", filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          setParticipants(prev =>
            prev.map(p => p.id === payload.new.id ? payload.new as RaceParticipant : p)
          );
        })
      .subscribe();
  }, []);

  // ── Create room ───────────────────────────────────────────────
  const createRoom = useCallback(async (dist: number) => {
    if (!myUserId) return;
    if (!ergConnected) {
      toast({ title: "Connect your erg first", description: "You need a connected Concept2 PM5 to race.", variant: "destructive" });
      return;
    }
    const code = generateRoomCode();
    try {
      const { data: roomData, error } = await (supabase.from("race_rooms") as any).insert({
        room_code: code, creator_id: myUserId, distance: dist, status: "lobby",
      }).select().single();
      if (error) throw error;

      await (supabase.from("race_participants") as any).insert({
        room_id: roomData.id, user_id: myUserId, display_name: myName,
        erg_score_2k: my2k, current_distance: 0,
      });

      setRoom(roomData);
      roomRef.current = roomData;
      const { data: parts } = await (supabase.from("race_participants") as any)
        .select("*").eq("room_id", roomData.id);
      setParticipants(parts || []);

      subscribeToRoom(roomData.id);
      setAppState("waiting");
      finishedRef.current = false;
      strokesRef.current = [];
    } catch (e: any) {
      toast({ title: "Failed to create room", description: e.message, variant: "destructive" });
    }
  }, [myUserId, myName, my2k, ergConnected, subscribeToRoom, toast]);

  // ── Join room ─────────────────────────────────────────────────
  const joinRoom = useCallback(async (code: string) => {
    if (!myUserId) return;
    if (!ergConnected) {
      toast({
        title: "Connect your erg first",
        description: "You need a connected Concept2 PM5 to join a race. Go to the Devices tab to connect.",
        variant: "destructive",
      });
      return;
    }
    const upper = code.trim().toUpperCase();
    try {
      const { data: roomData, error } = await (supabase.from("race_rooms") as any)
        .select("*").eq("room_code", upper).maybeSingle();
      if (error || !roomData) { toast({ title: "Room not found", description: "Check the code and try again.", variant: "destructive" }); return; }
      if (roomData.status !== "lobby") { toast({ title: "Race already started", description: "This race is no longer accepting participants.", variant: "destructive" }); return; }

      const { data: existing } = await (supabase.from("race_participants") as any)
        .select("id").eq("room_id", roomData.id);
      if ((existing || []).length >= 8) { toast({ title: "Room is full", description: "Maximum 8 athletes per race.", variant: "destructive" }); return; }

      const { error: joinErr } = await (supabase.from("race_participants") as any).insert({
        room_id: roomData.id, user_id: myUserId, display_name: myName,
        erg_score_2k: my2k, current_distance: 0,
      });
      if (joinErr && joinErr.code !== "23505") throw joinErr;

      setRoom(roomData);
      roomRef.current = roomData;
      const { data: parts } = await (supabase.from("race_participants") as any)
        .select("*").eq("room_id", roomData.id);
      setParticipants(parts || []);

      subscribeToRoom(roomData.id);
      setAppState("waiting");
      finishedRef.current = false;
      strokesRef.current = [];
    } catch (e: any) {
      toast({ title: "Failed to join", description: e.message, variant: "destructive" });
    }
  }, [myUserId, myName, my2k, ergConnected, subscribeToRoom, toast]);

  // ── Matchmaking ───────────────────────────────────────────────
  const joinMatchmaking = useCallback(async () => {
    if (!myUserId) return;
    if (!ergConnected) {
      toast({ title: "Connect your erg first", description: "You need a connected Concept2 PM5 to find a race.", variant: "destructive" });
      return;
    }
    await (supabase.from("race_queue") as any).delete().eq("user_id", myUserId);
    await (supabase.from("race_queue") as any).insert({ user_id: myUserId, display_name: myName, erg_score_2k: my2k });

    setAppState("matchmaking");

    // Subscribe to queue
    if (queueChannelRef.current) supabase.removeChannel(queueChannelRef.current);
    queueChannelRef.current = supabase.channel("race_queue_watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "race_queue" }, async () => {
        const { data: queue } = await (supabase.from("race_queue") as any).select("*").order("queued_at", { ascending: true });
        if (!queue || queue.length < 2) { setQueueEntries(queue || []); return; }
        setQueueEntries(queue);

        // Oldest person in queue is the host
        const me = queue.find((q: QueueEntry) => q.user_id === myUserId);
        if (!me) return;
        const oldest = queue[0];
        if (oldest.user_id !== myUserId) return; // not my turn to host

        // Find best match
        const others = queue.filter((q: QueueEntry) => q.user_id !== myUserId);
        let match = others[0];
        if (my2k) {
          const byScore = others.filter((q: QueueEntry) => q.erg_score_2k !== null)
            .sort((a: QueueEntry, b: QueueEntry) => Math.abs((a.erg_score_2k || 0) - my2k) - Math.abs((b.erg_score_2k || 0) - my2k));
          if (byScore.length > 0) match = byScore[0];
        }
        if (!match) return;

        // Create room with 2000m default
        const code = generateRoomCode();
        const { data: newRoom, error } = await (supabase.from("race_rooms") as any).insert({
          room_code: code, creator_id: myUserId, distance: 2000, status: "lobby",
        }).select().single();
        if (error) return;

        await (supabase.from("race_participants") as any).insert([
          { room_id: newRoom.id, user_id: myUserId, display_name: myName, erg_score_2k: my2k, current_distance: 0 },
          { room_id: newRoom.id, user_id: match.user_id, display_name: match.display_name, erg_score_2k: match.erg_score_2k, current_distance: 0 },
        ]);

        // Remove both from queue
        await (supabase.from("race_queue") as any).delete().in("user_id", [myUserId, match.user_id]);

        setRoom(newRoom);
        roomRef.current = newRoom;
        const { data: parts } = await (supabase.from("race_participants") as any).select("*").eq("room_id", newRoom.id);
        setParticipants(parts || []);
        subscribeToRoom(newRoom.id);
        setAppState("waiting");
        finishedRef.current = false;
        strokesRef.current = [];
        toast({ title: "Match found!", description: `Racing against ${match.display_name}` });
      })
      .subscribe();

    // Subscribe to race_participants for invitation
    if (inviteChannelRef.current) supabase.removeChannel(inviteChannelRef.current);
    inviteChannelRef.current = supabase.channel(`race_invite_${myUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "race_participants", filter: `user_id=eq.${myUserId}` },
        async (payload: any) => {
          if (appStateRef.current !== "matchmaking") return;
          const roomId = payload.new.room_id;
          const { data: invRoom } = await (supabase.from("race_rooms") as any).select("*").eq("id", roomId).maybeSingle();
          if (!invRoom) return;
          // Remove from queue
          await (supabase.from("race_queue") as any).delete().eq("user_id", myUserId);
          setRoom(invRoom);
          roomRef.current = invRoom;
          const { data: parts } = await (supabase.from("race_participants") as any).select("*").eq("room_id", roomId);
          setParticipants(parts || []);
          subscribeToRoom(roomId);
          setAppState("waiting");
          finishedRef.current = false;
          strokesRef.current = [];
          toast({ title: "Match found!", description: "You've been added to a race!" });
          if (queueChannelRef.current) { supabase.removeChannel(queueChannelRef.current); queueChannelRef.current = null; }
          if (inviteChannelRef.current) { supabase.removeChannel(inviteChannelRef.current); inviteChannelRef.current = null; }
        })
      .subscribe();
  }, [myUserId, myName, my2k, ergConnected, subscribeToRoom, toast]);

  const leaveMatchmaking = useCallback(async () => {
    if (myUserId) await (supabase.from("race_queue") as any).delete().eq("user_id", myUserId);
    if (queueChannelRef.current) { supabase.removeChannel(queueChannelRef.current); queueChannelRef.current = null; }
    if (inviteChannelRef.current) { supabase.removeChannel(inviteChannelRef.current); inviteChannelRef.current = null; }
    setAppState("home");
    setQueueEntries([]);
  }, [myUserId]);

  // ── Start race (creator) ──────────────────────────────────────
  const startRace = useCallback(async () => {
    if (!room || !myUserId || room.creator_id !== myUserId) return;
    if (participants.length < 2) { toast({ title: "Need at least 2 athletes", description: "Share your room code to invite others.", variant: "destructive" }); return; }
    await (supabase.from("race_rooms") as any).update({ status: "countdown" }).eq("id", room.id);
  }, [room, myUserId, participants.length, toast]);

  // ── Countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (appState !== "countdown") return;
    setCountdown(3);
    let count = 3;
    const t = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(t);
        bleDataRef.current = {};
        strokesRef.current = [];
        latestDistRef.current = 0;
        latestSplitRef.current = 0;
        latestSpmRef.current = 0;
        finishedRef.current = false;
        setMySaved(false);
        setAppState("racing");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [appState]);

  // ── Upload BLE data during race ───────────────────────────────
  useEffect(() => {
    if (appState !== "racing" || !room || !myUserId) return;
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);

    uploadIntervalRef.current = setInterval(async () => {
      const d = bleDataRef.current;
      const dist = d.distance ?? 0;
      const raceDist = roomRef.current?.distance ?? room.distance;
      const isFinished = dist >= raceDist && dist > 0;

      await (supabase.from("race_participants") as any).upsert({
        room_id: room.id,
        user_id: myUserId,
        display_name: myName,
        current_split: d.splitPace ?? null,
        current_spm: d.strokeRate ?? null,
        current_distance: dist,
        current_watts: d.power ?? null,
        elapsed_time: d.elapsedTime ?? null,
        ...(isFinished && !finishedRef.current ? {
          finished_at: new Date().toISOString(),
          finish_time: d.elapsedTime ?? null,
          avg_split: strokesRef.current.length > 0
            ? Math.round(strokesRef.current.reduce((a, b) => a + b.split, 0) / strokesRef.current.length) : null,
          avg_spm: strokesRef.current.length > 0
            ? Math.round(strokesRef.current.reduce((a, b) => a + b.spm, 0) / strokesRef.current.length) : null,
          stroke_data: strokesRef.current.length > 0 ? strokesRef.current : null,
        } : {}),
      }, { onConflict: "room_id,user_id" });

      if (isFinished && !finishedRef.current) {
        finishedRef.current = true;
        clearInterval(uploadIntervalRef.current!);
        uploadIntervalRef.current = null;
        saveErgWorkout(d, room.distance);
      }
    }, 500);

    return () => {
      if (uploadIntervalRef.current) { clearInterval(uploadIntervalRef.current); uploadIntervalRef.current = null; }
    };
  }, [appState, room?.id, myUserId, myName]);

  // ── Save erg workout to profile ───────────────────────────────
  const saveErgWorkout = async (d: BleData, raceDist: number) => {
    if (!myUserId || mySaved) return;
    try {
      const finishTime = d.elapsedTime ?? null;
      const avgSplitCs = strokesRef.current.length > 0
        ? Math.round(strokesRef.current.reduce((a, b) => a + b.split, 0) / strokesRef.current.length) : null;
      await (supabase.from("erg_workouts") as any).insert({
        user_id: myUserId,
        workout_type: "race",
        distance: raceDist,
        duration: finishTime ? fmtTime(finishTime) : null,
        avg_split: avgSplitCs ? fmtPace(avgSplitCs) : null,
        notes: `Head-to-Head Race ${raceDist}m`,
      });
      setMySaved(true);
    } catch {}
  };

  // ── Fetch results ─────────────────────────────────────────────
  const fetchAndShowResults = useCallback(async (roomId: string) => {
    if (uploadIntervalRef.current) { clearInterval(uploadIntervalRef.current); uploadIntervalRef.current = null; }
    const { data } = await (supabase.from("race_participants") as any)
      .select("*").eq("room_id", roomId).order("finish_time", { ascending: true, nullsLast: true });
    setResults(data || []);
    setAppState("results");
  }, []);

  const showResultsNow = useCallback(async () => {
    if (!room) return;
    // Mark room finished
    await (supabase.from("race_rooms") as any).update({ status: "finished" }).eq("id", room.id);
    fetchAndShowResults(room.id);
  }, [room, fetchAndShowResults]);

  // ── Leave room ────────────────────────────────────────────────
  const leaveRoom = useCallback(async () => {
    if (uploadIntervalRef.current) { clearInterval(uploadIntervalRef.current); uploadIntervalRef.current = null; }
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    if (room && myUserId) {
      await (supabase.from("race_participants") as any).delete().eq("room_id", room.id).eq("user_id", myUserId);
    }
    setRoom(null); roomRef.current = null;
    setParticipants([]);
    setResults([]);
    setAppState("home");
  }, [room, myUserId]);

  // ── Replay chart data ─────────────────────────────────────────
  function buildReplayData(athletes: RaceParticipant[]) {
    const allDists = [...new Set(
      athletes.flatMap(p => (p.stroke_data || []).map(s => s.dist))
    )].sort((a, b) => a - b);
    return allDists.map(dist => {
      const pt: any = { dist };
      athletes.forEach(p => {
        const strokes = p.stroke_data || [];
        if (strokes.length === 0) return;
        const closest = strokes.reduce((best, s) =>
          Math.abs(s.dist - dist) < Math.abs(best.dist - dist) ? s : best, strokes[0]);
        if (Math.abs(closest.dist - dist) < 75) pt[p.user_id] = closest.split;
      });
      return pt;
    });
  }

  // ── Sorted race participants (leader first) ───────────────────
  const sortedParticipants = [...participants].sort((a, b) => {
    if ((b.current_distance ?? 0) !== (a.current_distance ?? 0))
      return (b.current_distance ?? 0) - (a.current_distance ?? 0);
    return 0;
  });

  // ── Render ────────────────────────────────────────────────────

  // ── Countdown screen ─────────────────────────────────────────
  if (appState === "countdown") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4 uppercase tracking-widest">Race starts in</p>
          <div className="text-[12rem] font-black tabular-nums leading-none text-white drop-shadow-2xl">
            {countdown > 0 ? countdown : <span className="text-green-400">GO!</span>}
          </div>
          <p className="text-gray-500 mt-6">{room?.distance}m — {participants.length} athletes</p>
        </div>
      </div>
    );
  }

  // ── Racing screen ─────────────────────────────────────────────
  if (appState === "racing" && room) {
    const raceDist = room.distance;
    const myParticipant = participants.find(p => p.user_id === myUserId);
    const myDist = myParticipant?.current_distance ?? 0;
    const iFinished = finishedRef.current || (myDist >= raceDist && myDist > 0);
    const allFinished = participants.length > 0 && participants.every(p => p.finished_at !== null);

    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Swords className="h-5 w-5 text-green-400" />
            <span className="font-bold">{raceDist}m Race</span>
            <Badge variant="outline" className="text-green-400 border-green-400/50 text-xs">{participants.length} athletes</Badge>
          </div>
          <div className="flex items-center gap-2">
            {(iFinished || allFinished) && (
              <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={showResultsNow}>
                <Flag className="h-3 w-3 mr-1" /> Results
              </Button>
            )}
            <div className={`flex items-center gap-1.5 text-xs ${ergConnected ? "text-green-400" : "text-red-400"}`}>
              <div className={`w-2 h-2 rounded-full ${ergConnected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
              {ergConnected ? "PM5" : "Disconnected"}
            </div>
          </div>
        </div>

        {/* Lane view */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {sortedParticipants.map((p, idx) => {
            const isMe = p.user_id === myUserId;
            const isLeader = idx === 0;
            const dist = p.current_distance ?? 0;
            const progress = Math.min((dist / raceDist) * 100, 100);
            const finished = !!p.finished_at;

            return (
              <div
                key={p.user_id}
                className={`rounded-xl border p-3 ${
                  isMe
                    ? "border-green-500/50 bg-green-950/20"
                    : "border-gray-800 bg-gray-900/50"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  {/* Position */}
                  <span className={`text-xs font-bold w-6 text-center tabular-nums ${
                    isLeader ? "text-yellow-400" : "text-gray-500"
                  }`}>
                    {isLeader ? <Crown className="h-4 w-4" /> : ordinal(idx + 1)}
                  </span>

                  {/* Name */}
                  <span className={`font-semibold text-sm flex-1 ${isMe ? "text-green-300" : "text-white"}`}>
                    {p.display_name}
                    {isMe && <span className="ml-1 text-xs text-green-500">(you)</span>}
                    {finished && <span className="ml-1 text-xs text-yellow-400">✓ Finished</span>}
                  </span>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="text-gray-400">
                      <span className="text-white font-mono">{fmtPace(p.current_split)}</span>
                      <span className="text-gray-600">/500m</span>
                    </span>
                    <span className="text-gray-400">
                      <span className="text-white font-mono">{p.current_spm ?? "--"}</span>
                      <span className="text-gray-600">spm</span>
                    </span>
                    <span className="text-gray-400">
                      <span className="text-white font-mono">{Math.round(dist)}</span>
                      <span className="text-gray-600">/{raceDist}m</span>
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      finished ? "bg-yellow-400" :
                      isLeader ? "bg-green-400" :
                      isMe ? "bg-blue-400" : "bg-gray-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                  {/* Finish line */}
                  <div className="absolute right-0 top-0 h-full w-px bg-gray-600" />
                </div>
              </div>
            );
          })}
        </div>

        {/* My stats bar */}
        <div className="border-t border-gray-800 px-4 py-3 bg-gray-900/80">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Split", value: fmtPace(bleDataRef.current.splitPace) },
              { label: "SPM",   value: bleDataRef.current.strokeRate ? `${bleDataRef.current.strokeRate}` : "--" },
              { label: "Dist",  value: bleDataRef.current.distance ? `${Math.round(bleDataRef.current.distance)}m` : "--m" },
              { label: "Time",  value: fmtTime(bleDataRef.current.elapsedTime) },
            ].map(s => (
              <div key={s.label}>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</div>
                <div className="font-mono font-bold text-green-400 text-lg leading-tight">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Results screen ────────────────────────────────────────────
  if (appState === "results") {
    const replayData = buildReplayData(results);
    const finishedResults = results.filter(r => r.finish_time !== null).sort((a, b) => (a.finish_time ?? 0) - (b.finish_time ?? 0));
    const dnfResults = results.filter(r => r.finish_time === null);

    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            <span className="font-bold text-lg">Race Results</span>
          </div>
          <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white" onClick={() => {
            leaveRoom();
            setAppState("home");
          }}>
            <RotateCcw className="h-4 w-4 mr-1" /> Race Again
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Rankings */}
          <div className="space-y-2">
            {[...finishedResults, ...dnfResults].map((p, idx) => {
              const isMe = p.user_id === myUserId;
              const rank = finishedResults.indexOf(p) + 1;
              const isDNF = !p.finish_time;
              return (
                <div
                  key={p.user_id}
                  className={`flex items-center gap-4 p-4 rounded-xl border ${
                    isMe ? "border-green-500/50 bg-green-950/20" : "border-gray-800 bg-gray-900/50"
                  }`}
                >
                  <div className="text-2xl w-8 text-center">
                    {isDNF ? "—" : rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : <span className="text-gray-400 text-sm font-bold">{rank}</span>}
                  </div>
                  <div className="flex-1">
                    <div className={`font-semibold ${isMe ? "text-green-300" : "text-white"}`}>
                      {p.display_name} {isMe && <span className="text-xs text-green-500">(you)</span>}
                    </div>
                    {isDNF ? (
                      <div className="text-xs text-gray-500">Did not finish</div>
                    ) : (
                      <div className="text-xs text-gray-400">
                        {fmtTime(p.finish_time)} • avg {fmtPace(p.avg_split)}/500m • {p.avg_spm ?? "--"} avg spm
                      </div>
                    )}
                  </div>
                  {!isDNF && <div className="font-mono font-bold text-green-400">{fmtTime(p.finish_time)}</div>}
                </div>
              );
            })}
          </div>

          {/* Replay Chart */}
          {replayData.length > 10 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Race Replay — Split over Distance</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={replayData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis
                    dataKey="dist"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={v => `${v}m`}
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                  />
                  <YAxis
                    reversed
                    tickFormatter={v => fmtPace(v)}
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={{ stroke: "#374151" }}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                    labelFormatter={v => `${v}m`}
                    formatter={(val: any, key: string) => {
                      const p = results.find(r => r.user_id === key);
                      return [fmtPace(val), p?.display_name || key];
                    }}
                  />
                  {results.map((p, i) => (
                    <Line
                      key={p.user_id}
                      type="monotone"
                      dataKey={p.user_id}
                      stroke={ATHLETE_COLORS[i % ATHLETE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-3">
                {results.map((p, i) => (
                  <div key={p.user_id} className="flex items-center gap-1.5 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ background: ATHLETE_COLORS[i % ATHLETE_COLORS.length] }} />
                    <span className="text-gray-400">{p.display_name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Matchmaking screen ────────────────────────────────────────
  if (appState === "matchmaking") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md w-full">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-blue-500/30 border-t-blue-400 animate-spin mx-auto" />
            <Search className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Finding a Race…</h2>
            <p className="text-gray-400 text-sm">Matching you with athletes of similar ability</p>
            {my2k && <p className="text-blue-400 text-xs mt-1 font-mono">Your 2k benchmark: {fmtPace(my2k)}/500m</p>}
          </div>
          {queueEntries.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-left">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">{queueEntries.length} in queue</p>
              {queueEntries.map(q => (
                <div key={q.user_id} className={`flex items-center gap-2 py-1.5 text-sm ${q.user_id === myUserId ? "text-blue-300 font-semibold" : "text-gray-300"}`}>
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  {q.display_name} {q.user_id === myUserId && "(you)"}
                  {q.erg_score_2k && <span className="text-gray-500 text-xs ml-auto font-mono">{fmtPace(q.erg_score_2k)}</span>}
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" className="border-gray-700 text-gray-300 hover:text-white" onClick={leaveMatchmaking}>
            <LogOut className="h-4 w-4 mr-2" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Waiting lobby ─────────────────────────────────────────────
  if (appState === "waiting" && room) {
    const isCreator = room.creator_id === myUserId;
    const canStart = isCreator && participants.length >= 2;

    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            <span className="font-bold">Race Lobby</span>
          </div>
          <Button size="sm" variant="ghost" className="text-gray-400 hover:text-red-400 text-xs" onClick={leaveRoom}>
            <LogOut className="h-3.5 w-3.5 mr-1" /> Leave
          </Button>
        </div>

        <div className="flex-1 p-4 space-y-4">
          {/* Room code */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Room Code</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl font-black tracking-[0.2em] font-mono text-white">{room.room_code}</span>
              <Button size="sm" variant="ghost" className="text-gray-400 hover:text-white h-8 w-8 p-0" onClick={() => {
                navigator.clipboard.writeText(room.room_code);
                toast({ title: "Copied!", description: room.room_code });
              }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Share this code with up to {8 - participants.length} more athletes</p>
            <Badge className="mt-2 bg-blue-900/50 text-blue-300 border-blue-700/50">{room.distance}m</Badge>
          </div>

          {/* Participants */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">{participants.length}/8 Athletes</p>
            <div className="space-y-2">
              {participants.map((p, idx) => (
                <div key={p.user_id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                  p.user_id === myUserId ? "border-green-500/40 bg-green-950/20" : "border-gray-800 bg-gray-900/50"
                }`}>
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold" style={{ color: ATHLETE_COLORS[idx % ATHLETE_COLORS.length] }}>
                    {p.display_name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`flex-1 text-sm font-medium ${p.user_id === myUserId ? "text-green-300" : "text-white"}`}>
                    {p.display_name}
                    {p.user_id === room.creator_id && <span className="ml-1.5 text-[10px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">HOST</span>}
                    {p.user_id === myUserId && <span className="ml-1 text-xs text-gray-500">(you)</span>}
                  </span>
                  {p.erg_score_2k && <span className="text-xs text-gray-500 font-mono">{fmtPace(p.erg_score_2k)}</span>}
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                </div>
              ))}
            </div>
          </div>

          {/* Start button */}
          {isCreator && (
            <div className="space-y-2">
              {!canStart && (
                <p className="text-xs text-gray-500 text-center">Waiting for at least 1 more athlete to join…</p>
              )}
              <Button
                className="w-full h-12 text-base font-bold bg-green-600 hover:bg-green-700 disabled:opacity-40"
                disabled={!canStart}
                onClick={startRace}
              >
                <Play className="h-5 w-5 mr-2" /> Start Race
              </Button>
            </div>
          )}
          {!isCreator && (
            <p className="text-xs text-gray-400 text-center py-2">Waiting for host to start the race…</p>
          )}
        </div>
      </div>
    );
  }

  // ── Home screen ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" /> Head-to-Head Racing
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Race live against 2–8 athletes from anywhere</p>
        </div>
      </div>

      {/* BLE Connection */}
      <Card className={`border ${ergConnected ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${ergConnected ? "bg-green-400 animate-pulse" : "bg-amber-400"}`} />
              <div>
                <p className={`font-semibold text-sm ${ergConnected ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {ergConnected ? "Erg Connected — Ready to Race" : "Erg Not Connected"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ergConnected ? "Concept2 PM5 streaming live data" : "Connect your Concept2 PM5 to race"}
                </p>
              </div>
            </div>
            {ergConnected ? (
              <Button size="sm" variant="outline" onClick={disconnectErg} className="shrink-0">
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={connectErg} disabled={connecting || !btSupported} className="shrink-0 gap-2">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bluetooth className="h-4 w-4" />}
                {connecting ? "Connecting…" : "Connect PM5"}
              </Button>
            )}
          </div>
          {!btSupported && (
            <div className="flex items-center gap-2 mt-3 p-2 bg-destructive/10 rounded-lg">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">Web Bluetooth requires Chrome or Edge on desktop, or Chrome on Android.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Three action cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Create Race */}
        <Card className="border-border shadow-card hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Flag className="h-5 w-5 text-primary" /> Create a Race
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Set the distance and get a shareable room code. Others join with the code.</p>
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Distance</p>
              <div className="flex gap-2 flex-wrap">
                {DISTANCES.map(d => (
                  <button
                    key={d}
                    onClick={() => { setSelectedDist(d); setShowCustom(false); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      selectedDist === d && !showCustom
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {d}m
                  </button>
                ))}
                <button
                  onClick={() => setShowCustom(true)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    showCustom
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  Custom
                </button>
              </div>
              {showCustom && (
                <div className="flex gap-2 mt-2">
                  <Input
                    type="number"
                    placeholder="metres"
                    value={customDist}
                    onChange={e => setCustomDist(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => {
                    const d = parseInt(customDist);
                    if (d >= 100 && d <= 100000) { setSelectedDist(d); setShowCustom(false); }
                    else toast({ title: "Invalid distance", description: "Enter between 100m and 100000m.", variant: "destructive" });
                  }}>Set</Button>
                </div>
              )}
            </div>
            <Button className="w-full" onClick={() => createRoom(selectedDist)} disabled={!ergConnected}>
              <Flag className="h-4 w-4 mr-2" /> Create Room
            </Button>
            {!ergConnected && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Connect your erg first
              </p>
            )}
          </CardContent>
        </Card>

        {/* Join Race */}
        <Card className="border-border shadow-card hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" /> Join a Race
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter the 6-character room code shared by the race creator.</p>
            <Input
              placeholder="Room code, e.g. ABC123"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && joinCode.length >= 4 && joinRoom(joinCode)}
              className="font-mono tracking-widest uppercase text-center text-base h-11"
              maxLength={6}
            />
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={joinCode.length < 4 || !ergConnected}
              onClick={() => joinRoom(joinCode)}
            >
              <ChevronRightIcon /> Join Room
            </Button>
            {!ergConnected && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Connect your erg first
              </p>
            )}
          </CardContent>
        </Card>

        {/* Find a Race */}
        <Card className="border-border shadow-card hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-5 w-5 text-purple-500" /> Find a Race
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Join the matchmaking queue and get paired with athletes of similar ability.</p>
            {my2k ? (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-medium">Your 2k benchmark</p>
                  <p className="text-xs text-muted-foreground font-mono">{fmtPace(my2k)}/500m avg split</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">Log a 2000m workout to enable score-based matching</p>
              </div>
            )}
            <Button
              className="w-full bg-purple-600 hover:bg-purple-700"
              onClick={joinMatchmaking}
              disabled={!ergConnected}
            >
              <Search className="h-4 w-4 mr-2" /> Find a Race
            </Button>
            {!ergConnected && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Connect your erg first
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info panel */}
      <Card className="border-border bg-muted/30">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { icon: Users, label: "2–8 athletes", sub: "per race" },
              { icon: Timer, label: "Live sync", sub: "Supabase realtime" },
              { icon: Bluetooth, label: "PM5 required", sub: "Concept2 BLE" },
              { icon: Trophy, label: "Results saved", sub: "to your profile" },
            ].map(({ icon: Icon, label, sub }) => (
              <div key={label} className="space-y-1">
                <Icon className="h-5 w-5 text-primary mx-auto" />
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
