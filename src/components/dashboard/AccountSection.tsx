import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, AlertTriangle, Download, Shield, CheckCircle2, XCircle, Monitor, Map } from "lucide-react";
import { useTour } from "@/components/tour/TourContext";
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
import { getSessionUser } from "@/lib/getUser";

// Password must be 12+ chars, uppercase, lowercase, number, special char
function passwordStrength(p: string): { score: number; label: string; color: string; checks: Record<string, boolean> } {
  const checks = {
    length: p.length >= 12,
    upper: /[A-Z]/.test(p),
    lower: /[a-z]/.test(p),
    number: /[0-9]/.test(p),
    special: /[^A-Za-z0-9]/.test(p),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const label = score <= 1 ? "Weak" : score <= 3 ? "Fair" : score === 4 ? "Good" : "Strong";
  const color = score <= 1 ? "bg-red-500" : score <= 3 ? "bg-yellow-500" : score === 4 ? "bg-blue-500" : "bg-green-500";
  return { score, label, color, checks };
}

export function AccountSection() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [signOutAllLoading, setSignOutAllLoading] = useState(false);

  const { startTour } = useTour();

  const { data: profile } = useQuery({
    queryKey: ["account-profile"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("full_name, created_at, last_active_at").eq("id", user.id).maybeSingle();
      return { ...data, email: user.email, last_sign_in: user.last_sign_in_at };
    },
  });

  const signOutAllDevices = async () => {
    setSignOutAllLoading(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;
      toast({ title: "Signed out everywhere", description: "All other sessions have been revoked." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSignOutAllLoading(false);
    }
  };

  const pwStrength = passwordStrength(newPassword);

  const updateEmail = async () => {
    if (!newEmail) return;
    setEmailLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast({ title: "Confirmation sent", description: "Check your new email to confirm the change." });
      setNewEmail("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setEmailLoading(false);
    }
  };

  const updatePassword = async () => {
    if (!newPassword) return;
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (!pwStrength.checks.length) {
      toast({ title: "Password too short", description: "Minimum 12 characters required.", variant: "destructive" });
      return;
    }
    if (!pwStrength.checks.upper || !pwStrength.checks.lower || !pwStrength.checks.number || !pwStrength.checks.special) {
      toast({ title: "Password too weak", description: "Must include uppercase, lowercase, number, and special character.", variant: "destructive" });
      return;
    }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // Log to audit
      const user = await getSessionUser();
      if (user) {
        await (supabase as any).from("audit_logs").insert({ user_id: user.id, action: "password_change", resource_type: "user" });
      }
      toast({ title: "Password updated" });
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPasswordLoading(false);
    }
  };

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

  const CheckRow = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-600" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Account Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage your email, password, and account. CrewSync complies with Massachusetts 201 CMR 17.00.</p>
      </div>

      {/* Account info */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Account Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Email</span>
              <span className="font-medium text-foreground">{profile.email}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Account created</span>
              <span>{profile.created_at ? new Date(profile.created_at as string).toLocaleDateString() : "—"}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Last sign in</span>
              <span>{profile.last_sign_in ? new Date(profile.last_sign_in as string).toLocaleString() : "—"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trusted Devices / Session Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4" />
            Session Security
          </CardTitle>
          <CardDescription className="text-xs">
            Sessions expire automatically after 30 days of inactivity. Sign out all other devices if you suspect unauthorized access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile && (
            <div className="rounded-md border px-3 py-2 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Current session</span>
                <span className="text-xs text-green-600 font-medium">Active</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Last activity: {profile.last_active_at ? new Date(profile.last_active_at as string).toLocaleString() : profile.last_sign_in ? new Date(profile.last_sign_in as string).toLocaleString() : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                Sessions automatically expire after 30 days without activity.
              </div>
            </div>
          )}
          <Button
            onClick={signOutAllDevices}
            disabled={signOutAllLoading}
            variant="outline"
            className="min-h-[44px]"
          >
            {signOutAllLoading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Sign Out All Devices
          </Button>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Email Address
          </CardTitle>
          <CardDescription className="text-xs">Update your account email. You'll receive a confirmation link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">New Email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@email.com" className="min-h-[44px]" />
          </div>
          <Button onClick={updateEmail} disabled={emailLoading || !newEmail} className="w-full sm:w-auto min-h-[44px]">
            {emailLoading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Update Email
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Password
          </CardTitle>
          <CardDescription className="text-xs">Minimum 12 characters with uppercase, lowercase, number, and special character.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">New Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="min-h-[44px]" />
            {newPassword.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pwStrength.color}`}
                      style={{ width: `${(pwStrength.score / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium">{pwStrength.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <CheckRow ok={pwStrength.checks.length} label="12+ characters" />
                  <CheckRow ok={pwStrength.checks.upper} label="Uppercase letter" />
                  <CheckRow ok={pwStrength.checks.lower} label="Lowercase letter" />
                  <CheckRow ok={pwStrength.checks.number} label="Number" />
                  <CheckRow ok={pwStrength.checks.special} label="Special character" />
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Confirm Password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="min-h-[44px]" />
          </div>
          <Button
            onClick={updatePassword}
            disabled={passwordLoading || !newPassword || pwStrength.score < 5}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {passwordLoading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Update Password
          </Button>
        </CardContent>
      </Card>

      {/* Data export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            Export My Data
          </CardTitle>
          <CardDescription className="text-xs">
            Download all your personal data as a JSON file. Your right to access your data is protected under Massachusetts 201 CMR 17.00.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportData} disabled={exportLoading} variant="outline" className="min-h-[44px]">
            {exportLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {exportLoading ? "Preparing export…" : "Download My Data"}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Includes profile, all erg workouts and scores, recovery logs, wellness check-ins, and workout plans.
          </p>
        </CardContent>
      </Card>

      {/* Restart Tour */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Map className="h-4 w-4" />
            App Tour
          </CardTitle>
          <CardDescription className="text-xs">Relaunch the interactive tour to revisit all features from the beginning.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => {
              const role: string | null = (profile as any)?.user_type ?? (profile as any)?.role ?? null;
              const userId = (profile as any)?.id;
              if (userId) startTour(role, userId);
            }}
          >
            Restart Tour
          </Button>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-xs">
            Permanently and irreversibly delete your account and all personal data. Required by Massachusetts 201 CMR 17.00 — we perform a hard delete with no recovery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="min-h-[44px]">Delete My Account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>This will immediately and permanently delete:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Your profile and account credentials</li>
                      <li>All erg workouts and performance scores</li>
                      <li>All recovery logs and wellness check-ins</li>
                      <li>All training plans and workout history</li>
                      <li>All uploaded files (avatar, videos)</li>
                    </ul>
                    <p className="font-medium text-foreground">This cannot be undone. A confirmation email will be sent.</p>
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
    </div>
  );
}
