import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Send, MessageCircle, Loader2, Shield, Users, Eye } from "lucide-react";
import { displayName } from "./constants";
import { useToast } from "@/hooks/use-toast";

interface Props {
  teamId: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
  safesportMode?: boolean;
}

interface Thread {
  key: string;
  label: string;
  lastMessage: any;
  isGroup: boolean;
  athleteId?: string;
}

const SafeSportBadge = () => (
  <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-1.5 text-xs">
    <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
    <span className="font-semibold text-blue-700 dark:text-blue-300">SafeSport Compliant</span>
  </div>
);

const DirectMessages = ({ teamId, teamMembers, isCoach, profile, safesportMode = true }: Props) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [parentVisible, setParentVisible] = useState(false);
  const [groupType, setGroupType] = useState<"individual" | "boat" | "coxswains" | "all">("individual");
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const athletes = teamMembers
    .map((m: any) => m.profile || m)
    .filter((p: any) => p?.id && p.id !== profile.id && p.role !== "coach");

  // Coach-athlete messages (SafeSport transparent)
  const { data: camMessages = [], isLoading: camLoading } = useQuery({
    queryKey: ["coach-athlete-messages", teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_athlete_messages" as any)
        .select("*")
        .eq("team_id", teamId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Athlete-to-athlete private messages (unchanged — SafeSport only restricts coach-minor communication)
  const { data: dmMessages = [], isLoading: dmLoading } = useQuery({
    queryKey: ["direct-messages", teamId, profile.id],
    queryFn: async () => {
      if (isCoach) return [];
      const { data, error } = await supabase
        .from("direct_messages" as any)
        .select("*")
        .eq("team_id", teamId)
        .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !isCoach,
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`cam-${teamId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "coach_athlete_messages",
        filter: `team_id=eq.${teamId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["coach-athlete-messages", teamId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedThread, camMessages.length, dmMessages.length]);

  // Build thread list for coaches
  const buildCoachThreads = (): Thread[] => {
    const threadMap = new Map<string, Thread>();

    // Individual athlete threads
    for (const athlete of athletes) {
      const key = `individual:${athlete.id}`;
      const msgs = camMessages.filter((m: any) =>
        (m.group_type === "individual" && m.recipient_athlete_id === athlete.id) ||
        (m.group_type === "individual" && m.sender_id === athlete.id)
      );
      threadMap.set(key, {
        key,
        label: displayName(athlete),
        lastMessage: msgs[msgs.length - 1] || null,
        isGroup: false,
        athleteId: athlete.id,
      });
    }

    // Group threads
    const groupTypes = [
      { type: "boat" as const, label: "Boat Group" },
      { type: "coxswains" as const, label: "All Coxswains" },
      { type: "all" as const, label: "All Athletes" },
    ];
    for (const { type, label } of groupTypes) {
      const msgs = camMessages.filter((m: any) => m.group_type === type);
      if (msgs.length > 0) {
        threadMap.set(`group:${type}`, {
          key: `group:${type}`,
          label,
          lastMessage: msgs[msgs.length - 1] || null,
          isGroup: true,
        });
      }
    }

    return Array.from(threadMap.values()).sort((a, b) => {
      const at = a.lastMessage?.created_at || "";
      const bt = b.lastMessage?.created_at || "";
      return bt.localeCompare(at);
    });
  };

  // Build thread list for athletes
  const buildAthleteThreads = (): Thread[] => {
    const threads: Thread[] = [];

    // Coach messages visible to this athlete
    const myCoachMsgs = camMessages.filter((m: any) =>
      m.recipient_athlete_id === profile.id ||
      m.sender_id === profile.id ||
      m.group_type === "all" ||
      (m.group_type === "coxswains" && (profile.is_coxswain || profile.role === "coxswain"))
    );
    if (myCoachMsgs.length > 0) {
      threads.push({
        key: "coach-thread",
        label: "Coach Messages",
        lastMessage: myCoachMsgs[myCoachMsgs.length - 1],
        isGroup: false,
      });
    } else {
      threads.push({
        key: "coach-thread",
        label: "Coach Messages",
        lastMessage: null,
        isGroup: false,
      });
    }

    // Athlete-to-athlete DMs
    const dmMap = new Map<string, Thread>();
    for (const msg of dmMessages) {
      const otherId = msg.sender_id === profile.id ? msg.recipient_id : msg.sender_id;
      const other = athletes.find((a: any) => a.id === otherId) || { id: otherId, full_name: "Athlete" };
      if (!dmMap.has(otherId)) {
        dmMap.set(otherId, { key: `dm:${otherId}`, label: displayName(other), lastMessage: msg, isGroup: false, athleteId: otherId });
      } else {
        dmMap.get(otherId)!.lastMessage = msg;
      }
    }
    // Also show all athletes even without messages
    for (const a of athletes) {
      if (!dmMap.has(a.id)) {
        dmMap.set(a.id, { key: `dm:${a.id}`, label: displayName(a), lastMessage: null, isGroup: false, athleteId: a.id });
      }
    }
    threads.push(...dmMap.values());

    return threads;
  };

  const threads = isCoach ? buildCoachThreads() : buildAthleteThreads();

  const getThreadMessages = () => {
    if (!selectedThread) return [];
    if (isCoach) {
      if (selectedThread.startsWith("individual:")) {
        const athleteId = selectedThread.replace("individual:", "");
        return camMessages.filter((m: any) =>
          (m.group_type === "individual" && m.recipient_athlete_id === athleteId) ||
          (m.group_type === "individual" && m.sender_id === athleteId)
        );
      }
      if (selectedThread.startsWith("group:")) {
        const gtype = selectedThread.replace("group:", "");
        return camMessages.filter((m: any) => m.group_type === gtype);
      }
    } else {
      if (selectedThread === "coach-thread") {
        return camMessages.filter((m: any) =>
          m.recipient_athlete_id === profile.id ||
          m.sender_id === profile.id ||
          m.group_type === "all" ||
          (m.group_type === "coxswains" && (profile.is_coxswain || profile.role === "coxswain"))
        );
      }
      if (selectedThread.startsWith("dm:")) {
        const otherId = selectedThread.replace("dm:", "");
        return dmMessages.filter((m: any) =>
          (m.sender_id === profile.id && m.recipient_id === otherId) ||
          (m.sender_id === otherId && m.recipient_id === profile.id)
        );
      }
    }
    return [];
  };

  const threadMessages = getThreadMessages();

  const sendCoachMessage = useMutation({
    mutationFn: async () => {
      if (!newMessage.trim() || !selectedThread) return;
      const trimmed = newMessage.trim();

      if (isCoach) {
        if (selectedThread.startsWith("individual:")) {
          const athleteId = selectedThread.replace("individual:", "");
          const { error } = await supabase.from("coach_athlete_messages" as any).insert({
            team_id: teamId,
            sender_id: profile.id,
            recipient_athlete_id: athleteId,
            group_type: "individual",
            content: trimmed,
            parent_visible: parentVisible,
          });
          if (error) throw error;
        } else if (selectedThread.startsWith("group:")) {
          const gtype = selectedThread.replace("group:", "");
          const { error } = await supabase.from("coach_athlete_messages" as any).insert({
            team_id: teamId,
            sender_id: profile.id,
            recipient_athlete_id: null,
            group_type: gtype,
            content: trimmed,
            parent_visible: parentVisible,
          });
          if (error) throw error;
        } else if (selectedThread === "new-group") {
          const { error } = await supabase.from("coach_athlete_messages" as any).insert({
            team_id: teamId,
            sender_id: profile.id,
            recipient_athlete_id: null,
            group_type: groupType === "individual" ? "all" : groupType,
            content: trimmed,
            parent_visible: parentVisible,
          });
          if (error) throw error;
        }
      } else {
        // Athlete replying to coach
        if (selectedThread === "coach-thread") {
          const { error } = await supabase.from("coach_athlete_messages" as any).insert({
            team_id: teamId,
            sender_id: profile.id,
            recipient_athlete_id: null,
            group_type: "individual",
            content: trimmed,
            parent_visible: false,
          });
          if (error) throw error;
        } else if (selectedThread.startsWith("dm:")) {
          const otherId = selectedThread.replace("dm:", "");
          const { error } = await supabase.from("direct_messages" as any).insert({
            sender_id: profile.id,
            recipient_id: otherId,
            team_id: teamId,
            content: trimmed,
            read: false,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["coach-athlete-messages", teamId] });
      queryClient.invalidateQueries({ queryKey: ["direct-messages", teamId, profile.id] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isCoachThread = selectedThread && (selectedThread.startsWith("individual:") || selectedThread.startsWith("group:") || selectedThread === "coach-thread");
  const isDMThread = selectedThread && selectedThread.startsWith("dm:");
  const selectedThread_ = threads.find((t) => t.key === selectedThread);

  if (camLoading || dmLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }

  if (selectedThread) {
    return (
      <div className="flex flex-col h-[600px]">
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b mb-3">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setSelectedThread(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {selectedThread_?.isGroup ? <Users className="h-4 w-4" /> : (selectedThread_?.label.slice(0, 2).toUpperCase())}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedThread_?.label}</p>
            {isCoachThread && (
              <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                {isDMThread ? "Private between athletes" : "Visible to all coaches · SafeSport compliant"}
              </p>
            )}
            {isDMThread && (
              <p className="text-xs text-muted-foreground">Private athlete message</p>
            )}
          </div>
        </div>

        {/* SafeSport notice for coach messages */}
        {isCoach && isCoachThread && safesportMode && (
          <div className="mb-3 flex items-start gap-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>This message is visible to all coaches on your team in compliance with SafeSport guidelines.</span>
          </div>
        )}
        {isCoach && isCoachThread && !safesportMode && (
          <div className="mb-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>SafeSport mode is off. This message is only visible to you and the recipient. Not recommended for programs with minor athletes.</span>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {threadMessages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Start the conversation!</p>
          )}
          {threadMessages.map((msg: any, i: number) => {
            const isMine = msg.sender_id === profile.id;
            const senderProfile = teamMembers.find((m: any) => (m.profile || m).id === msg.sender_id);
            const senderName = senderProfile ? displayName(senderProfile.profile || senderProfile) : "Unknown";
            return (
              <div key={msg.id || i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  isMine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                }`}>
                  {!isMine && <p className="text-[10px] font-semibold mb-0.5 opacity-70">{senderName}</p>}
                  <p>{msg.content}</p>
                  <div className={`flex items-center gap-1 mt-1 ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    <span className="text-[10px]">
                      {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                    {msg.parent_visible && (
                      <span className="text-[10px] flex items-center gap-0.5">
                        <Eye className="h-2.5 w-2.5" /> Parent
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Parent visibility toggle for coaches */}
        {isCoach && isCoachThread && (
          <div className="flex items-center gap-2 pt-2 pb-1">
            <Switch id="parent-visible" checked={parentVisible} onCheckedChange={setParentVisible} className="scale-75" />
            <Label htmlFor="parent-visible" className="text-xs text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Visible to parent
            </Label>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 pt-2 border-t mt-1">
          <Input
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendCoachMessage.mutate(); } }}
          />
          <Button
            size="sm"
            onClick={() => sendCoachMessage.mutate()}
            disabled={!newMessage.trim() || sendCoachMessage.isPending}
            className="gap-1"
          >
            {sendCoachMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Messages</h2>
          <p className="text-sm text-muted-foreground">
            {isCoach ? "Transparent coach-athlete communication" : "Messages from your coaches and teammates"}
          </p>
        </div>
        <SafeSportBadge />
      </div>

      {/* New group message — coaches only */}
      {isCoach && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Send Group Message</p>
            <div className="flex gap-2">
              <Select value={groupType} onValueChange={(v) => setGroupType(v as any)}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Athletes</SelectItem>
                  <SelectItem value="coxswains">All Coxswains</SelectItem>
                  <SelectItem value="boat">Boat Group</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8"
                onClick={() => setSelectedThread("new-group")}
              >
                <MessageCircle className="h-3.5 w-3.5 mr-1" />
                Compose
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {threads.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">
              {isCoach ? "Select an athlete below to send a SafeSport compliant message." : "No messages yet. Your coaches can message you here."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {/* Individual athlete threads for coaches */}
        {isCoach && athletes.length > 0 && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Individual Athletes</p>
            {athletes.map((athlete: any) => {
              const key = `individual:${athlete.id}`;
              const thread = threads.find((t) => t.key === key);
              return (
                <button key={key} className="w-full text-left" onClick={() => setSelectedThread(key)}>
                  <Card className="hover:bg-muted/50 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="text-xs">{displayName(athlete).slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium truncate">{displayName(athlete)}</p>
                            {thread?.lastMessage && (
                              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                                {new Date(thread.lastMessage.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {thread?.lastMessage ? thread.lastMessage.content : "No messages yet — tap to message"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </>
        )}

        {/* Group and other threads */}
        {threads.filter((t) => t.isGroup || (!isCoach && t.key !== "coach-thread" && !t.isGroup) || (!isCoach && t.key === "coach-thread")).map((thread) => (
          <button key={thread.key} className="w-full text-left" onClick={() => setSelectedThread(thread.key)}>
            <Card className="hover:bg-muted/50 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-xs">
                      {thread.isGroup ? <Users className="h-4 w-4" /> : thread.label.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-medium truncate">{thread.label}</p>
                        {thread.isGroup && <Badge variant="outline" className="text-[10px] px-1 h-4 shrink-0">Group</Badge>}
                        {thread.key === "coach-thread" && <Badge variant="outline" className="text-[10px] px-1 h-4 shrink-0 text-blue-600 border-blue-300">SafeSport</Badge>}
                      </div>
                      {thread.lastMessage && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(thread.lastMessage.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {thread.lastMessage ? thread.lastMessage.content : "No messages yet — tap to start"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {isCoach && safesportMode && (
        <p className="text-xs text-muted-foreground text-center pt-2 flex items-center justify-center gap-1">
          <Shield className="h-3 w-3 text-blue-500" />
          All coach-athlete messages are visible to every coach on this team per SafeSport guidelines.
        </p>
      )}
      {isCoach && !safesportMode && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center pt-2 flex items-center justify-center gap-1">
          <Shield className="h-3 w-3" />
          SafeSport mode is off — coach-athlete messages are not shared with other coaches.
        </p>
      )}
    </div>
  );
};

export default DirectMessages;
