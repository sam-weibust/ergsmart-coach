import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Send, MessageCircle, Loader2 } from "lucide-react";
import { displayName } from "./constants";
import { useToast } from "@/hooks/use-toast";

interface Props {
  teamId: string;
  teamMembers: any[];
  isCoach: boolean;
  profile: any;
}

interface Thread {
  otherId: string;
  otherProfile: any;
  lastMessage: any;
  unreadCount: number;
}

const DirectMessages = ({ teamId, teamMembers, isCoach, profile }: Props) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const allProfiles = teamMembers.map((m: any) => m.profile || m).filter((p: any) => p?.id && p.id !== profile.id);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["direct-messages", teamId, profile.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages" as any)
        .select("*")
        .eq("team_id", teamId)
        .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`direct-messages-${teamId}-${profile.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
        filter: `team_id=eq.${teamId}`,
      }, (payload: any) => {
        const msg = payload.new;
        if (msg.sender_id === profile.id || msg.recipient_id === profile.id) {
          queryClient.invalidateQueries({ queryKey: ["direct-messages", teamId, profile.id] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teamId, profile.id, queryClient]);

  // Scroll to bottom when thread changes or messages load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedThread, messages.length]);

  // Mark messages as read when opening a thread
  useEffect(() => {
    if (!selectedThread) return;
    const unread = messages.filter((m: any) =>
      m.sender_id === selectedThread && m.recipient_id === profile.id && !m.read
    );
    if (unread.length === 0) return;
    const ids = unread.map((m: any) => m.id);
    supabase
      .from("direct_messages" as any)
      .update({ read: true })
      .in("id", ids)
      .then(() => queryClient.invalidateQueries({ queryKey: ["direct-messages", teamId, profile.id] }));
  }, [selectedThread, messages, profile.id, teamId, queryClient]);

  // Build thread list
  const threadMap = new Map<string, Thread>();
  for (const msg of messages) {
    const otherId = msg.sender_id === profile.id ? msg.recipient_id : msg.sender_id;
    const existing = threadMap.get(otherId);
    const unreadCount = msg.recipient_id === profile.id && !msg.read ? 1 : 0;
    if (!existing) {
      const otherProfile = allProfiles.find((p: any) => p.id === otherId) || { id: otherId, full_name: "Unknown" };
      threadMap.set(otherId, { otherId, otherProfile, lastMessage: msg, unreadCount });
    } else {
      existing.lastMessage = msg;
      if (msg.recipient_id === profile.id && !msg.read) existing.unreadCount++;
    }
  }

  // For coaches, also show all team members even without messages
  if (isCoach) {
    for (const p of allProfiles) {
      if (!threadMap.has(p.id)) {
        threadMap.set(p.id, { otherId: p.id, otherProfile: p, lastMessage: null, unreadCount: 0 });
      }
    }
  }

  const threads = Array.from(threadMap.values()).sort((a, b) => {
    const aTime = a.lastMessage?.created_at || "";
    const bTime = b.lastMessage?.created_at || "";
    return bTime.localeCompare(aTime);
  });

  const threadMessages = selectedThread
    ? messages.filter((m: any) =>
        (m.sender_id === profile.id && m.recipient_id === selectedThread) ||
        (m.sender_id === selectedThread && m.recipient_id === profile.id)
      )
    : [];

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!newMessage.trim() || !selectedThread) return;
      const trimmed = newMessage.trim();
      const { error } = await supabase
        .from("direct_messages" as any)
        .insert({
          sender_id: profile.id,
          recipient_id: selectedThread,
          team_id: teamId,
          content: trimmed,
          read: false,
        });
      if (error) throw error;
      if (isCoach) {
        const coachName = profile.full_name || profile.username || "Coach";
        supabase.functions.invoke("send-notification", {
          body: {
            user_id: selectedThread,
            type: "direct_message",
            title: `Message from Coach ${coachName}`,
            body: trimmed.slice(0, 50),
            data: { sender_id: profile.id, team_id: teamId },
          },
        }).catch((e) => console.error("send-notification error:", e));
      }
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["direct-messages", teamId, profile.id] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const selectedOtherProfile = selectedThread
    ? (allProfiles.find((p: any) => p.id === selectedThread) || threadMap.get(selectedThread)?.otherProfile)
    : null;

  if (isLoading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }

  if (selectedThread) {
    return (
      <div className="flex flex-col h-[600px]">
        <div className="flex items-center gap-3 pb-3 border-b mb-3">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setSelectedThread(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{displayName(selectedOtherProfile).slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{displayName(selectedOtherProfile)}</p>
            <p className="text-xs text-muted-foreground">Private message</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {threadMessages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Start the conversation!</p>
          )}
          {threadMessages.map((msg: any) => {
            const isMine = msg.sender_id === profile.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  isMine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                }`}>
                  <p>{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    {isMine && msg.read && " · Read"}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 pt-3 border-t mt-3">
          <Input
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage.mutate(); } }}
          />
          <Button
            size="sm"
            onClick={() => sendMessage.mutate()}
            disabled={!newMessage.trim() || sendMessage.isPending}
            className="gap-1"
          >
            {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Messages</h2>
        <p className="text-sm text-muted-foreground">
          {isCoach ? "Private conversations with your athletes" : "Messages from your coaches"}
        </p>
      </div>

      {threads.length === 0 && !isCoach && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No messages yet. Your coaches can message you here.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {threads.map(thread => (
          <button
            key={thread.otherId}
            className="w-full text-left"
            onClick={() => setSelectedThread(thread.otherId)}
          >
            <Card className="hover:bg-muted/50 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="text-sm">
                      {displayName(thread.otherProfile).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{displayName(thread.otherProfile)}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        {thread.unreadCount > 0 && (
                          <Badge className="h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                            {thread.unreadCount}
                          </Badge>
                        )}
                        {thread.lastMessage && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(thread.lastMessage.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {thread.lastMessage
                        ? (thread.lastMessage.sender_id === profile.id ? "You: " : "") + thread.lastMessage.content
                        : "No messages yet — tap to start"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
};

export default DirectMessages;
