import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { User, Sailboat, GraduationCap, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

type RoleKey = "athlete" | "coxswain" | "coach";

const ROLE_OPTIONS: { key: RoleKey; label: string; icon: React.ElementType; blurb: string }[] = [
  { key: "athlete", label: "Athlete", icon: User, blurb: "Train, log workouts, and track your progress." },
  { key: "coxswain", label: "Coxswain", icon: Sailboat, blurb: "Cox your boat and stay in sync with the team." },
  { key: "coach", label: "Coach", icon: GraduationCap, blurb: "Manage teams, lineups, and athlete plans." },
];

// Map a chosen role to the consistent set of profile columns the app reads.
// user_type drives routing; role + is_coxswain keep derived UI in sync.
const ROLE_UPDATE: Record<RoleKey, { user_type: string; role: string; is_coxswain: boolean }> = {
  athlete: { user_type: "rower", role: "athlete", is_coxswain: false },
  coxswain: { user_type: "coxswain", role: "coxswain", is_coxswain: true },
  coach: { user_type: "coach", role: "coach", is_coxswain: false },
};

function resolveRole(profile: any): RoleKey | "organizer" {
  const ut = profile?.user_type;
  const role = profile?.role;
  if (ut === "coach" || ut === "head_coach" || role === "coach" || role === "head_coach") return "coach";
  if (ut === "coxswain" || role === "coxswain" || profile?.is_coxswain === true) return "coxswain";
  if (ut === "organizer") return "organizer";
  return "athlete";
}

const ROLE_LABEL: Record<string, string> = {
  athlete: "Athlete",
  coxswain: "Coxswain",
  coach: "Coach",
  organizer: "Organizer",
};

/**
 * Role switcher shown in both athlete and coach settings. Renders just the
 * inner content (badge + button + modal) so callers can wrap it however they
 * like. On confirm it updates user_type/role/is_coxswain for the current user
 * and forces a full app reload so routing picks up the new role immediately.
 */
export default function ChangeRoleSection({
  profile,
  accentColor = "hsl(var(--primary))",
}: {
  profile: any;
  accentColor?: string;
}) {
  const { toast } = useToast();
  const currentRole = resolveRole(profile);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<RoleKey>(currentRole === "organizer" ? "athlete" : currentRole);
  const [saving, setSaving] = useState(false);

  const isChanged = selected !== currentRole;

  const openModal = () => {
    setSelected(currentRole === "organizer" ? "athlete" : currentRole);
    setOpen(true);
  };

  const confirm = async () => {
    if (!isChanged || !profile?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update(ROLE_UPDATE[selected])
        .eq("id", profile.id);
      if (error) throw error;
      toast({ title: `You're now a ${ROLE_LABEL[selected]}`, description: "Reloading the app…" });
      // Full reload to root — AppRouter re-resolves the destination from the
      // fresh user_type, so the new role takes effect without manual logout.
      setTimeout(() => {
        window.location.href = "/";
      }, 700);
    } catch (e: any) {
      toast({ title: "Couldn't change role", description: e.message, variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Current role</p>
          <Badge variant="secondary" className="text-xs">{ROLE_LABEL[currentRole] ?? "Athlete"}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={openModal} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Change Role
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change your role</DialogTitle>
            <DialogDescription>Pick the role that matches how you use the app.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {ROLE_OPTIONS.map((opt) => {
              const isSel = selected === opt.key;
              const isCurrent = currentRole === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={saving}
                  onClick={() => setSelected(opt.key)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    isSel ? "border-transparent ring-2" : "border-border hover:bg-muted/50"
                  )}
                  style={isSel ? { ["--tw-ring-color" as any]: accentColor } : undefined}
                >
                  <opt.icon className="h-5 w-5 shrink-0" style={{ color: accentColor }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      {opt.label}
                      {isCurrent && <span className="text-[10px] text-muted-foreground font-normal">(current)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{opt.blurb}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {isChanged && (
            <div className="flex gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Changing your role to <strong>{ROLE_LABEL[selected]}</strong> will update your app experience. This
                cannot be undone without contacting support.
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Coaches need to create or join a team after switching. Athletes need a join code from their coach.
          </p>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirm} disabled={!isChanged || saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
