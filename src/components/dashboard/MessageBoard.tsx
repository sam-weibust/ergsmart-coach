import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, MessageCircle } from "lucide-react";

interface MessageBoardProps {
  teamId?: string;
  friendId?: string;
  currentUserId: string;
  title: string;
}

export const MessageBoard = ({ teamId, friendId, currentUserId, title }: MessageBoardProps) => {
  const [message, setMessage] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: messages, refetch } = useQuery({
    queryKey: ["messages", teamId, friendId],
    queryFn: async () => {
      if (teamId) {
        const { data } = await supabase
          .from("team_messages")
          .select("*, profile:profiles(full_name, username)")
          .eq("team_id", teamId)
          .order("created_at", { ascending: true });
        return data || [];
      } else if (friendId && currentUserId) {
        const { data } = await supabase
          .from("friend_messages")
          .select("*, sender:profiles!friend_messages_sender_id_fkey(full_name, username)")
          .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
          .order("created_at", { ascending: true });
        return data || [];
      }
      return [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channelName = teamId ? `team-messages-${teamId}` : `friend-messages-${friendId}`;
    const tableName = teamId ? "team_messages" : "friend_messages";
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName },
        () => refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, friendId, refetch]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!message.trim()) return;

      if (teamId) {
        const { error } = await supabase.from("team_messages").insert({
          team_id: teamId,
          user_id: currentUserId,
          content: message.trim(),
        });
        if (error) throw error;
      } else if (friendId) {
        const { error } = await supabase.from("friend_messages").insert({
          sender_id: currentUserId,
          receiver_id: friendId,
          content: message.trim(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setMessage("");
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Error sending message", description: error.message, variant: "destructive" });
    },
  });

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Card className="flex flex-col h-[400px] md:h-[500px]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-3">
            {messages?.map((msg: any) => {
              const isOwn = teamId 
                ? msg.user_id === currentUserId 
                : msg.sender_id === currentUserId;
              const name = teamId 
                ? msg.profile?.full_name || msg.profile?.username 
                : msg.sender?.full_name || msg.sender?.username;
              
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                      isOwn
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted rounded-bl-sm"
                    }`}
                  >
                    {!isOwn && (
                      <p className="text-xs font-medium opacity-70 mb-1">{name}</p>
                    )}
                    <p className="text-sm break-words">{msg.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              );
            })}
            {(!messages || messages.length === 0) && (
              <p className="text-center text-muted-foreground text-sm py-8">
                No messages yet. Start the conversation!
              </p>
            )}
          </div>
        </ScrollArea>
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Input
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage.mutate()}
            className="flex-1"
          />
          <Button 
            size="icon" 
            onClick={() => sendMessage.mutate()}
            disabled={!message.trim() || sendMessage.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
