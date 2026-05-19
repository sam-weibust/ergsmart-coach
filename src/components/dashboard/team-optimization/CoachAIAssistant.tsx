import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Trash2, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function BetaBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full font-semibold">
      <Sparkles className="h-2.5 w-2.5" />
      Free During Beta · Elite Team Fall 2026
    </span>
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  teamId: string;
  teamName: string;
  profile: any;
  isCoach: boolean;
}

export default function CoachAIAssistant({ teamId, teamName, profile, isCoach }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Load history from DB
  const { data: history } = useQuery({
    queryKey: ["coach-ai-messages", teamId, profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_ai_messages" as any)
        .select("role, content")
        .eq("team_id", teamId)
        .eq("coach_id", profile.id)
        .order("created_at", { ascending: true })
        .limit(50);
      return (data || []) as Message[];
    },
    enabled: !!profile?.id,
  });

  useEffect(() => {
    if (history && messages.length === 0) setMessages(history);
  }, [history]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function saveMessage(role: "user" | "assistant", content: string) {
    await supabase.from("coach_ai_messages" as any).insert({
      team_id: teamId,
      coach_id: profile.id,
      role,
      content,
    });
  }

  async function send() {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    await saveMessage("user", userMsg.content);

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/chat-coach-team`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          coach_id: profile.id,
          team_id: teamId,
          messages: newMessages,
        }),
      });

      if (!resp.ok) throw new Error("AI service error");

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.delta?.text || parsed.delta?.content?.[0]?.text || "";
              if (delta) {
                assistantText += delta;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantText };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }

      await saveMessage("assistant", assistantText);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't reach the AI service. Try again." }]);
    } finally {
      setStreaming(false);
    }
  }

  const clearHistory = useMutation({
    mutationFn: async () => {
      await supabase.from("coach_ai_messages" as any)
        .delete()
        .eq("team_id", teamId)
        .eq("coach_id", profile.id);
    },
    onSuccess: () => {
      setMessages([]);
      qc.invalidateQueries({ queryKey: ["coach-ai-messages", teamId, profile?.id] });
    },
  });

  const SUGGESTIONS = [
    "Who should be in the top 8+ this Saturday based on recent data?",
    "Which athlete has improved the most in the last 30 days?",
    "Who is showing signs of overtraining right now?",
    "What does the data say about our port vs starboard balance?",
    "Generate a 2-week taper plan for NEIRA.",
  ];

  if (!isCoach) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Coach AI is only available to coaches.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)] min-h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-500" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-foreground text-sm">Coach AI — {teamName}</h3>
              <BetaBadge />
            </div>
            <p className="text-xs text-muted-foreground">Ask anything about your team. Powered by full team data.</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => clearHistory.mutate()} className="text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-3">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          AI analysis is based on logged data only. Combine with your coaching judgment.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center pt-4">
              Ask me anything about your team — lineups, athlete performance, training load, or strategy.
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); }}
                  className="text-left text-sm text-muted-foreground border border-border rounded-lg px-3 py-2 hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "assistant" && (
              <div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                <Bot className="h-4 w-4 text-purple-600" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-[#0a1628] text-white rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              )}
            >
              {msg.content.split("\n").map((line, j) => (
                <span key={j}>{line}{j < msg.content.split("\n").length - 1 && <br />}</span>
              ))}
              {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse rounded-sm" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your team..."
          className="flex-1 min-h-[44px] max-h-32 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <Button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="self-end"
          size="icon"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
