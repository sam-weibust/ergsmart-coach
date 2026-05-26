import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Upload, Globe, Palette, Sparkles } from "lucide-react";

function BetaBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full font-semibold">
      <Sparkles className="h-2.5 w-2.5" />
      Free During Beta · Elite Team Fall 2026
    </span>
  );
}

interface Props {
  teamId: string;
  isCoach: boolean;
}

export default function TeamBrandingSection({ teamId, isCoach }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [colorInput, setColorInput] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [descInput, setDescInput] = useState("");

  const { data: team, isLoading } = useQuery({
    queryKey: ["team-branding", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("name, slug, logo_url, primary_color, portal_public, portal_description")
        .eq("id", teamId)
        .maybeSingle();
      if (data) {
        setColorInput(data.primary_color || "#0a1628");
        setSlugInput(data.slug || "");
        setDescInput(data.portal_description || "");
      }
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      console.log("[TeamBranding] saving to teams table:", updates);
      const { error } = await supabase.from("teams").update(updates).eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      qc.invalidateQueries({ queryKey: ["team-branding", teamId] });
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["global-team-branding"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("File too large — max 2MB");
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["png", "jpg", "jpeg", "webp"].includes(ext || "")) {
        throw new Error("Only PNG, JPG, or WebP files are accepted");
      }

      const path = `${teamId}/logo.${ext}`;
      console.log("[TeamBranding] uploading logo:", file.name, "size:", file.size, "to path:", path);

      const { error: upErr, data: upData } = await supabase.storage
        .from("team-logos")
        .upload(path, file, { upsert: true, contentType: file.type });

      console.log("[TeamBranding] storage upload result:", { upData, upErr });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

      const { data: { publicUrl } } = supabase.storage.from("team-logos").getPublicUrl(path);
      console.log("[TeamBranding] public URL:", publicUrl);

      if (!publicUrl) throw new Error("Could not get public URL for uploaded logo");

      // Append cache-buster so the browser loads the new logo immediately
      const urlWithBust = `${publicUrl}?v=${Date.now()}`;
      await saveMutation.mutateAsync({ logo_url: urlWithBust });
      console.log("[TeamBranding] logo_url saved:", urlWithBust);
      toast({ title: "Logo uploaded", description: "Team logo updated successfully." });
    } catch (e: any) {
      console.error("[TeamBranding] upload error:", e);
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  const color = colorInput || "#0a1628";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-foreground">Custom Team Branding</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Logo and colors applied throughout the team experience</p>
        </div>
        <BetaBadge />
      </div>

      {/* Preview strip */}
      <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{ background: color }}
      >
        {team?.logo_url ? (
          <img src={team.logo_url} alt="Team logo" className="h-12 w-12 rounded-lg object-cover bg-white" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center text-white text-xl font-black">
            {team?.name?.[0] || "T"}
          </div>
        )}
        <div>
          <p className="text-white font-bold text-base">{team?.name}</p>
          <p className="text-white/60 text-xs">Team portal preview</p>
        </div>
      </div>

      <div className="grid gap-5">
        {/* Logo upload */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Team Logo</Label>
          <div className="flex gap-3 items-center">
            <Button
              variant="outline"
              size="sm"
              disabled={!isCoach || uploading}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload Logo"}
            </Button>
            {team?.logo_url && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => saveMutation.mutate({ logo_url: null })}
              >
                Remove
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PNG or JPG, max 2MB</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
          />
        </div>

        {/* Color picker */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Primary Team Color
          </Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={colorInput}
              disabled={!isCoach}
              onChange={(e) => setColorInput(e.target.value)}
              className="h-10 w-16 rounded-lg border border-border cursor-pointer p-1"
            />
            <Input
              value={colorInput}
              disabled={!isCoach}
              onChange={(e) => setColorInput(e.target.value)}
              placeholder="#0a1628"
              className="w-32 font-mono text-sm"
            />
            <Button
              size="sm"
              disabled={!isCoach || saveMutation.isPending}
              onClick={() => saveMutation.mutate({ primary_color: colorInput })}
            >
              Save Color
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Applied to team header, lineup cards, leaderboard, and message board</p>
        </div>

        {/* Slug / portal URL */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Team Slug (Portal URL)
          </Label>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground whitespace-nowrap">crewsync.app/team/</span>
            <Input
              value={slugInput}
              disabled={!isCoach}
              onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="my-team"
              className="font-mono text-sm"
            />
            <Button
              size="sm"
              disabled={!isCoach || saveMutation.isPending}
              onClick={() => saveMutation.mutate({ slug: slugInput })}
            >
              Save
            </Button>
          </div>
        </div>

        {/* Portal description */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Portal Description</Label>
          <Input
            value={descInput}
            disabled={!isCoach}
            onChange={(e) => setDescInput(e.target.value)}
            placeholder="A short description for your public team portal"
          />
          <Button
            size="sm"
            disabled={!isCoach || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ portal_description: descInput })}
          >
            Save Description
          </Button>
        </div>

        {/* Portal visibility */}
        <div className="flex items-center justify-between border rounded-xl px-4 py-3 bg-muted/40">
          <div>
            <p className="text-sm font-semibold">Public Team Portal</p>
            <p className="text-xs text-muted-foreground">
              {team?.portal_public
                ? `Public · crewsync.app/team/${team?.slug || teamId.slice(0, 8)}`
                : "Private — only visible to team members"}
            </p>
          </div>
          <Switch
            checked={!!team?.portal_public}
            disabled={!isCoach}
            onCheckedChange={(val) => saveMutation.mutate({ portal_public: val })}
          />
        </div>
      </div>
    </div>
  );
}
