import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, User } from "lucide-react";

interface Props {
  coachId: string;
}

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-muted text-muted-foreground",
  replied: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  no_response: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function ContactHistorySection({ coachId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["recruit-contacts", coachId],
    queryFn: async () => {
      const { data: contacts } = await supabase
        .from("recruit_contacts")
        .select("*")
        .eq("coach_id", coachId)
        .order("contacted_at", { ascending: false });

      if (!contacts?.length) return [];

      const athleteIds = [...new Set(contacts.map((c: any) => c.athlete_user_id))];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", athleteIds);

      const profileMap: Record<string, string> = {};
      for (const p of profiles ?? []) profileMap[p.id] = p.full_name ?? "Athlete";

      return contacts.map((c: any) => ({
        ...c,
        athleteName: profileMap[c.athlete_user_id] ?? "Athlete",
      }));
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!data?.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Mail className="h-10 w-10 mx-auto mb-3 text-primary/40" />
        <p className="text-lg font-medium">No contact history yet</p>
        <p className="text-sm mt-1">Use Contact on an athlete's profile to log outreach</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((contact: any) => (
        <div
          key={contact.id}
          className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{contact.athleteName}</p>
            {contact.subject && <p className="text-xs text-muted-foreground truncate">{contact.subject}</p>}
          </div>
          <div className="text-right shrink-0 space-y-1">
            <Badge className={`text-[10px] ${STATUS_COLORS[contact.status] ?? "bg-muted"}`}>
              {contact.status?.replace("_", " ") ?? "sent"}
            </Badge>
            <p className="text-[10px] text-muted-foreground">
              {new Date(contact.contacted_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
