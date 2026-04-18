import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Gift, Users, Trophy, Star } from "lucide-react";
import { toast } from "sonner";

interface ReferralSectionProps {
  profile: any;
}

export function ReferralSection({ profile }: ReferralSectionProps) {
  const [copied, setCopied] = useState(false);

  const referralCode = profile?.username || profile?.id?.slice(0, 8) || "loading";
  const referralLink = `${window.location.origin}/auth?ref=${referralCode}`;

  const { data: referrals = [] } = useQuery({
    queryKey: ["my-referrals", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("referrals" as any)
        .select("*")
        .eq("referrer_user_id", profile.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ["referral-leaderboard"],
    queryFn: async () => {
      const { data } = await supabase
        .from("referrals" as any)
        .select("referrer_user_id, referrer_code")
        .not("referred_user_id", "is", null);

      if (!data) return [];

      const counts: Record<string, { code: string; count: number }> = {};
      for (const r of data as any[]) {
        if (!counts[r.referrer_user_id]) {
          counts[r.referrer_user_id] = { code: r.referrer_code, count: 0 };
        }
        counts[r.referrer_user_id].count++;
      }

      const top = Object.entries(counts)
        .map(([uid, v]) => ({ uid, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      if (top.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", top.map(t => t.uid));

      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
      return top.map(t => ({ ...t, profile: profileMap[t.uid] }));
    },
  });

  const totalReferrals = referrals.length;
  const successfulSignups = (referrals as any[]).filter(r => r.referred_user_id).length;
  const rewards = (referrals as any[]).filter(r => r.rewarded_at).length;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Your referral link */}
      <Card className="bg-gradient-to-br from-[#0a1628] to-[#112240] border-[#2d6be4]/30 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Gift className="h-5 w-5 text-[#2d6be4]" />
            Your Referral Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-white/70 text-sm">
            Share your link — when someone signs up, you both get a reward!
          </p>

          <div className="flex gap-2">
            <div className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white/80 truncate">
              {referralLink}
            </div>
            <Button
              onClick={handleCopy}
              className="bg-[#2d6be4] hover:bg-[#1e55c4] text-white gap-2 shrink-0"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            {[
              { label: "Referrals Sent", value: totalReferrals, icon: Users },
              { label: "Signups", value: successfulSignups, icon: Star },
              { label: "Rewards Earned", value: rewards, icon: Trophy },
            ].map(stat => (
              <div key={stat.label} className="bg-white/10 rounded-xl p-3 text-center">
                <stat.icon className="h-4 w-4 mx-auto mb-1 text-[#2d6be4]" />
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/50 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent referrals */}
      {(referrals as any[]).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Referrals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(referrals as any[]).slice(0, 10).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.referred_user_id ? "Signed up" : "Pending"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.referred_user_id ? (
                      <Badge className="bg-green-100 text-green-700 border-none text-xs">Signed Up</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Pending</Badge>
                    )}
                    {r.rewarded_at && (
                      <Badge className="bg-[#2d6be4]/10 text-[#2d6be4] border-none text-xs">Rewarded</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-[#f59e0b]" />
            Top Referrers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              No referrals yet. Be the first to share CrewSync!
            </p>
          ) : (
            <div className="space-y-3">
              {(leaderboard as any[]).map((entry, i) => (
                <div key={entry.uid} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                    i === 0 ? "bg-[#f59e0b] text-white" :
                    i === 1 ? "bg-gray-300 text-gray-700" :
                    i === 2 ? "bg-amber-600 text-white" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {entry.profile?.full_name || entry.profile?.username || entry.code}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {entry.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
