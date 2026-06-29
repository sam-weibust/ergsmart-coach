import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/getUser";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  User,
  ChevronRight,
  ChevronLeft,
  Bell,
  Plug,
  ShieldCheck,
  Trophy,
  GraduationCap,
  Sailboat,
  Download,
  Loader2,
  AlertTriangle,
  LogOut,
  Lock,
} from "lucide-react";

import { ProfileEditPanel } from "../ProfileEditPanel";
import { AccountSection } from "../AccountSection";
import { NotificationSettings } from "../NotificationSettings";
import Concept2Section from "../Concept2Section";
import WhoopConnectSection from "../WhoopConnectSection";
import HealthKitConnect from "../HealthKitConnect";
import AwardsSection from "../AwardsSection";
import ChangeRoleSection from "../ChangeRoleSection";

import type { AthleteTabProps } from "./types";

type SubView =
  | "root"
  | "notifications"
  | "connected"
  | "account"
  | "achievements";

/**
 * SETTINGS TAB — owned by Subagent 6.
 *
 * Scrollable grouped-card settings screen:
 *  1. My Profile  (ProfileEditPanel sheet; shows name/email/grad year etc.)
 *  2. Connected Apps  (Concept2 / Whoop / Apple HealthKit status + last sync)
 *  3. Notifications  (NotificationSettings — push + email prefs)
 *  4. Privacy  (leaderboard opt-in + public profile visibility)
 *  5. More  (Regattas, Recruiting Profile, Achievements, Connected Apps)
 *  6. Danger Zone  (Export My Data, Delete Account) + Sign Out
 *
 * Sub-views render inline with a back button (matches the shell idiom).
 */
export default function SettingsTab(props: AthleteTabProps) {
  const { userId, profile, teamColor, onRefresh } = props;
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [view, setView] = useState<SubView>("root");
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [signOutLoading, setSignOutLoading] = useState(false);

  const isAdmin = !!(profile as any)?.is_admin;
  const isCoxswain = props.isCoxswain;

  // ── Avatar + grad year live in athlete_profiles ──────────────────────────
  const { data: athleteProfile } = useQuery({
    queryKey: ["settings-athlete-profile", userId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("athlete_profiles")
        .select("avatar_url, grad_year, is_public, directory_opt_in")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
  });

  // ── Privacy toggles (leaderboard_opt_in on profiles; is_public + ──────────
  //    directory_opt_in on athlete_profiles) ─────────────────────────────────
  const { data: privacy } = useQuery({
    queryKey: ["settings-privacy", userId],
    queryFn: async () => {
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("leaderboard_opt_in")
        .eq("id", userId)
        .maybeSingle();
      const { data: ap } = await (supabase as any)
        .from("athlete_profiles")
        .select("is_public, directory_opt_in")
        .eq("user_id", userId)
        .maybeSingle();
      return {
        leaderboard_opt_in: (prof as any)?.leaderboard_opt_in ?? false,
        is_public: (ap as any)?.is_public ?? false,
        directory_opt_in: (ap as any)?.directory_opt_in ?? false,
      };
    },
  });

  // Optimistic local mirror so toggles respond to taps instantly instead of
  // waiting on a server round-trip (the cause of the "tabs not responding" bug).
  const [privacyLocal, setPrivacyLocal] = useState<{
    leaderboard_opt_in: boolean;
    is_public: boolean;
    directory_opt_in: boolean;
  } | null>(null);
  useEffect(() => {
    if (privacy) setPrivacyLocal(privacy);
  }, [privacy]);
  const pv = privacyLocal ?? privacy;

  const setLeaderboardOptIn = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ leaderboard_opt_in: value })
        .eq("id", userId);
      if (error) throw error;
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["settings-privacy", userId] }),
  });

  const setAthleteProfileFlag = useMutation({
    mutationFn: async ({ key, value }: { key: "is_public" | "directory_opt_in"; value: boolean }) => {
      const { error } = await (supabase as any)
        .from("athlete_profiles")
        .upsert({ user_id: userId, [key]: value }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-privacy", userId] });
      queryClient.invalidateQueries({ queryKey: ["settings-athlete-profile", userId] });
    },
  });

  const toggleLeaderboard = (v: boolean) => {
    setPrivacyLocal((s) => ({ ...(s ?? privacy!), leaderboard_opt_in: v }));
    setLeaderboardOptIn.mutate(v);
  };
  const toggleAthleteFlag = (key: "is_public" | "directory_opt_in", v: boolean) => {
    setPrivacyLocal((s) => ({ ...(s ?? privacy!), [key]: v }));
    setAthleteProfileFlag.mutate({ key, value: v });
  };

  // ── Danger zone: reuse the existing edge functions ───────────────────────
  const exportData = async () => {
    setExportLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const resp = await supabase.functions.invoke("export-user-data");
      if (resp.error) throw new Error(resp.error.message);
      const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "crewsync-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: "Your data has been downloaded." });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      toast({ title: "Type DELETE to confirm", variant: "destructive" });
      return;
    }
    setDeleteLoading(true);
    try {
      const resp = await supabase.functions.invoke("delete-account");
      if (resp.error) throw new Error(resp.error.message);
      if (resp.data?.error) throw new Error(resp.data.error);
      await supabase.auth.signOut();
      navigate("/auth");
      toast({ title: "Account deleted", description: "All your data has been permanently removed." });
    } catch (e: any) {
      toast({ title: "Deletion failed", description: e.message, variant: "destructive" });
      setDeleteLoading(false);
    }
  };

  const signOut = async () => {
    setSignOutLoading(true);
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setSignOutLoading(false);
    }
  };

  const displayName = (profile as any)?.full_name || (profile as any)?.username || "Athlete";
  const email = (profile as any)?.email || "";
  const gradYear = (athleteProfile as any)?.grad_year;
  const avatarUrl = (athleteProfile as any)?.avatar_url;
  const initials = displayName.charAt(0).toUpperCase();

  // ── Sub-view shell with back button ──────────────────────────────────────
  const SubViewShell = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-4">
      <button
        onClick={() => setView("root")}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Settings
      </button>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </div>
  );

  if (view !== "root") {
    return (
      <div className="px-4 py-4 pb-28 max-w-2xl mx-auto">
        {view === "notifications" && (
          <SubViewShell title="Notifications">
            <NotificationSettings />
          </SubViewShell>
        )}
        {view === "connected" && (
          <SubViewShell title="Connected Apps">
            <div className="space-y-6">
              <Concept2Section />
              <WhoopConnectSection />
              <HealthKitConnect />
            </div>
          </SubViewShell>
        )}
        {view === "account" && (
          <SubViewShell title="Account">
            <AccountSection />
          </SubViewShell>
        )}
        {view === "achievements" && (
          <SubViewShell title="Achievements">
            <AwardsSection profile={profile} />
          </SubViewShell>
        )}
      </div>
    );
  }

  // ── Root settings screen ─────────────────────────────────────────────────
  const NavRow = ({
    icon: Icon,
    label,
    description,
    onClick,
  }: {
    icon: React.ElementType;
    label: string;
    description?: string;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors min-h-[52px]"
    >
      <Icon className="h-5 w-5 shrink-0" style={{ color: teamColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );

  return (
    <div className="px-4 py-4 pb-28 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your profile, integrations, and privacy.</p>
      </div>

      {/* ── 1. My Profile ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <button
            onClick={() => setProfileSheetOpen(true)}
            className="w-full flex items-center gap-4 text-left"
          >
            <Avatar className="h-14 w-14">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{displayName}</p>
              {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
              <p className="text-xs text-muted-foreground">
                {(profile as any)?.experience_level ? `${(profile as any).experience_level} · ` : ""}
                {gradYear ? `Class of ${gradYear}` : isCoxswain ? "Coxswain" : "Athlete"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </CardContent>
      </Card>
      <ProfileEditPanel
        open={profileSheetOpen}
        onClose={() => {
          setProfileSheetOpen(false);
          void onRefresh();
          queryClient.invalidateQueries({ queryKey: ["settings-athlete-profile", userId] });
        }}
      />

      {/* ── Role ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Role
          </CardTitle>
          <CardDescription className="text-xs">Switch between athlete, coxswain, and coach.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeRoleSection profile={profile} accentColor={teamColor} />
        </CardContent>
      </Card>

      {/* ── 2. Connected Apps (summary, full status inside) ─────────────── */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground px-1">Integrations</h2>
        <Card>
          <CardContent className="p-0 divide-y">
            <NavRow
              icon={Plug}
              label="Connected Apps"
              description="Concept2, Whoop, Apple Health"
              onClick={() => setView("connected")}
            />
            <NavRow
              icon={Bell}
              label="Notifications"
              description="Push and email preferences"
              onClick={() => setView("notifications")}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── 4. Privacy ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Privacy
          </CardTitle>
          <CardDescription className="text-xs">Control where you appear publicly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm">Global leaderboard</Label>
              <p className="text-xs text-muted-foreground">Show my erg scores on public leaderboards.</p>
            </div>
            <Switch
              checked={!!pv?.leaderboard_opt_in}
              onCheckedChange={toggleLeaderboard}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm">Public profile</Label>
              <p className="text-xs text-muted-foreground">Let coaches and others view my athlete profile.</p>
            </div>
            <Switch
              checked={!!pv?.is_public}
              onCheckedChange={(v) => toggleAthleteFlag("is_public", v)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm">Athlete directory</Label>
              <p className="text-xs text-muted-foreground">Appear in the searchable recruiting directory.</p>
            </div>
            <Switch
              checked={!!pv?.directory_opt_in}
              onCheckedChange={(v) => toggleAthleteFlag("directory_opt_in", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 5. More ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground px-1">More</h2>
        <Card>
          <CardContent className="p-0 divide-y">
            <NavRow icon={Trophy} label="Achievements" description="Badges and milestones" onClick={() => setView("achievements")} />
            <NavRow icon={Lock} label="Account & Security" description="Email, password, devices" onClick={() => setView("account")} />
          </CardContent>
        </Card>
      </div>

      {/* Admin */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin</CardTitle>
            <CardDescription className="text-xs">API cost dashboard lives in the admin section of the dashboard.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* ── 6. Danger Zone ──────────────────────────────────────────────── */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-xs">
            Export or permanently delete your data. Account deletion is a hard delete with no recovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={exportData} disabled={exportLoading} variant="outline" className="w-full min-h-[44px]">
            {exportLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {exportLoading ? "Preparing export…" : "Export My Data"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full min-h-[44px]">Delete My Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>This immediately and permanently deletes your profile, workouts, scores, logs, plans, and uploaded files.</p>
                    <p className="font-medium text-foreground">This cannot be undone.</p>
                    <p className="text-xs">Type <strong>DELETE</strong> to confirm.</p>
                    <Input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="Type DELETE"
                      className="font-mono"
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteAccount}
                  disabled={deleteLoading || deleteConfirmText !== "DELETE"}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Permanently Delete Everything"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Button onClick={signOut} disabled={signOutLoading} variant="outline" className="w-full min-h-[44px]">
        {signOutLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
        Sign Out
      </Button>
    </div>
  );
}
