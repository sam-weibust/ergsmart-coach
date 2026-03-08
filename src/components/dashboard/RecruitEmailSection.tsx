import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail, Loader2, Copy, Check, User, Clock, Lightbulb, AlertTriangle, Shield
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Coach {
  name: string;
  title: string;
  email: string;
  confidence: "verified" | "likely" | "pattern-based";
  notes?: string;
}

interface CampaignEmail {
  sequence_number: number;
  email_type: string;
  timing: string;
  subject: string;
  body: string;
  tips: string;
}

interface EmailData {
  coaches: Coach[];
  general_email?: string;
  email_campaign: CampaignEmail[];
  campaign_tips: string[];
}

interface RecruitEmailSectionProps {
  school: string;
  division: string;
  chance?: string;
  profile: any;
  goals: any;
  gpa: string;
  gender: string;
  predictionData?: any;
  onClose: () => void;
}

const confidenceConfig = {
  verified: { label: "Verified", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", icon: Shield },
  likely: { label: "Likely", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", icon: Shield },
  "pattern-based": { label: "Pattern", color: "bg-muted text-muted-foreground border-border", icon: Shield },
};

const RecruitEmailSection = ({
  school, division, chance, profile, goals, gpa, gender, predictionData, onClose
}: RecruitEmailSectionProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [emailData, setEmailData] = useState<EmailData | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeEmail, setActiveEmail] = useState("1");

  const generateEmails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-recruit-emails", {
        body: {
          school, division, profile, goals, gpa, gender,
          prediction: predictionData ? { predicted_tier: predictionData.predicted_tier, chance } : null,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }

      setEmailData(data);
    } catch (err: any) {
      toast({
        title: "Generation Failed",
        description: err.message || "Could not generate emails. Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: "Copied!", description: "Text copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyToClipboard(text, id)}
      className="h-7 gap-1.5 text-xs"
    >
      {copiedId === id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copiedId === id ? "Copied" : "Copy"}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                Email Campaign — {school}
              </CardTitle>
              <CardDescription className="mt-1">
                {division} • {chance ? `${chance.charAt(0).toUpperCase() + chance.slice(1)} chance` : ""}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>Back</Button>
          </div>
        </CardHeader>
        {!emailData && (
          <CardContent>
            <Button onClick={generateEmails} disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating campaign...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Generate Coach Emails & Campaign
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2">
              AI will find coaching staff emails and create a personalized 4-email recruitment sequence.
            </p>
          </CardContent>
        )}
      </Card>

      {emailData && (
        <div className="space-y-4 animate-fade-in">
          {/* Coach Contacts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Coaching Staff Contacts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {emailData.general_email && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">General Team Email</p>
                      <p className="text-sm font-mono font-medium">{emailData.general_email}</p>
                    </div>
                    <CopyButton text={emailData.general_email} id="general-email" />
                  </div>
                </div>
              )}
              {emailData.coaches.map((coach, i) => {
                const conf = confidenceConfig[coach.confidence];
                return (
                  <div key={i} className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-sm">{coach.name}</p>
                          <Badge variant="outline" className={`text-[10px] ${conf.color}`}>
                            {conf.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{coach.title}</p>
                        <p className="text-sm font-mono mt-1">{coach.email}</p>
                        {coach.notes && (
                          <p className="text-[10px] text-muted-foreground mt-1">{coach.notes}</p>
                        )}
                      </div>
                      <CopyButton text={coach.email} id={`coach-${i}`} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Coach emails are AI-generated based on known university patterns. Always verify before sending by checking the school's athletics website.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Email Campaign */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Recruitment Email Campaign
              </CardTitle>
              <CardDescription>4-step sequence with timing and personalized content</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeEmail} onValueChange={setActiveEmail}>
                <TabsList className="grid grid-cols-4 mb-4">
                  {emailData.email_campaign.map((email) => (
                    <TabsTrigger key={email.sequence_number} value={String(email.sequence_number)} className="text-xs">
                      Email {email.sequence_number}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {emailData.email_campaign.map((email) => (
                  <TabsContent key={email.sequence_number} value={String(email.sequence_number)} className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <Badge variant="outline" className="text-xs mb-1">{email.email_type}</Badge>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {email.timing}
                        </p>
                      </div>
                      <CopyButton
                        text={`Subject: ${email.subject}\n\n${email.body}`}
                        id={`email-${email.sequence_number}`}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Subject Line</p>
                        <p className="text-sm font-medium">{email.subject}</p>
                      </div>
                      <Textarea
                        value={email.body}
                        readOnly
                        className="min-h-[200px] text-sm font-mono leading-relaxed resize-none"
                      />
                    </div>
                    <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-[10px] font-medium text-primary mb-0.5">💡 Tips for this email</p>
                      <p className="text-xs text-muted-foreground">{email.tips}</p>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          {/* Campaign Tips */}
          {emailData.campaign_tips && emailData.campaign_tips.length > 0 && (
            <Card className="border-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  Campaign Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {emailData.campaign_tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default RecruitEmailSection;
