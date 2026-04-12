import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AskSectionProps {
  profile: any;
}

const AskSection = ({ profile }: AskSectionProps) => {
  const { toast } = useToast();

  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const askCoach = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const { data, error } = await supabase.functions.invoke("chat-rowing", {
        body: {
          user_id: profile.id,
          message: question,
          experience_level: profile.experience_level || "intermediate",
          goals: profile.goals || [],
        },
      });

      if (error) throw error;
      if (!data?.response) throw new Error("No response returned");

      setResponse(data.response);
    } catch (err) {
      console.error("Chat error:", err);
      toast({
        title: "Error",
        description: "Your AI coach couldn't respond. Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Ask Your AI Rowing Coach
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <Textarea
          placeholder="Ask anything about rowing technique, training, pacing, or strategy..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="min-h-[100px]"
        />

        <Button onClick={askCoach} disabled={loading || !question.trim()} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Thinking...
            </>
          ) : (
            "Ask Coach"
          )}
        </Button>

        {response && (
          <div className="p-4 border rounded-lg bg-muted">
            <h3 className="font-semibold mb-2">Coach Response</h3>
            <p className="text-sm whitespace-pre-line">{response}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AskSection;
