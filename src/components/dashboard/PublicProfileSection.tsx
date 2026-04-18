import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Eye, EyeOff, Copy, Loader2, Plus, Trash2, Sparkles, Camera,
  Globe, Instagram, Twitter, Youtube, Users, MapPin, School,
  Link2, ExternalLink
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const API_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const PublicProfileSection = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [school, setSchool] = useState("");
  const [clubTeam, setClubTeam] = useState("");
  const [location, setLocation] = useState("");
  const [personalStatement, setPersonalStatement] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [personalFacts, setPersonalFacts] = useState<{ label: string; value: string }[]>([]);
  const [socialLinks, setSocialLinks] = useState({ instagram: "", twitter: "", youtube: "", website: "" });
  const [uploading, setUploading] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: baseProfile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: ap, isLoading } = useQuery({
    queryKey: ["athlete-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle();
      return data;
    },
  });

  const { data: followersCount } = useQuery({
    queryKey: ["followers-count"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count } = await supabase.from("profile_follows").select("*", { count: "exact", head: true }).eq("following_id", user.id);
      return count || 0;
    },
  });

  useEffect(() => {
    if (!ap) return;
    setBio(ap.bio || "");
    setGradYear(ap.grad_year ? String(ap.grad_year) : "");
    setSchool(ap.school || "");
    setClubTeam(ap.club_team || "");
    setLocation(ap.location || "");
    setPersonalStatement(ap.personal_statement || "");
    setContactEmail(ap.contact_email || "");
    setIsPublic(ap.is_public || false);
    setPersonalFacts(ap.personal_facts || []);
    setSocialLinks(ap.social_links || { instagram: "", twitter: "", youtube: "", website: "" });
  }, [ap]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("athlete_profiles").upsert({
        user_id: user.id,
        bio,
        grad_year: gradYear ? parseInt(gradYear) : null,
        school,
        club_team: clubTeam,
        location,
        personal_statement: personalStatement,
        contact_email: contactEmail,
        is_public: isPublic,
        personal_facts: personalFacts,
        social_links: socialLinks,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete-profile"] });
      toast({ title: "Profile saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const uploadAvatar = async (file: File) => {
    if (!currentUser) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${currentUser.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("athlete_profiles").upsert({ user_id: currentUser.id, avatar_url: publicUrl }, { onConflict: "user_id" });
      queryClient.invalidateQueries({ queryKey: ["athlete-profile"] });
      toast({ title: "Photo uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const generateSummary = async () => {
    if (!currentUser) return;
    setGeneratingSummary(true);
    try {
      const session = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-athlete-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": API_KEY,
          "Authorization": `Bearer ${session.data.session?.access_token}`,
        },
        body: JSON.stringify({ user_id: currentUser.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.summary) {
        queryClient.invalidateQueries({ queryKey: ["athlete-profile"] });
        toast({ title: "AI summary generated!" });
      }
    } catch (e: any) {
      toast({ title: "Failed to generate summary", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const copyProfileLink = () => {
    const username = baseProfile?.username;
    if (!username) { toast({ title: "Set a username first", variant: "destructive" }); return; }
    navigator.clipboard.writeText(`${window.location.origin}/athlete/${username}`);
    toast({ title: "Profile link copied!" });
  };

  const addFact = () => {
    if (personalFacts.length >= 5) return;
    setPersonalFacts([...personalFacts, { label: "", value: "" }]);
  };

  const updateFact = (i: number, field: "label" | "value", v: string) => {
    setPersonalFacts(personalFacts.map((f, idx) => idx === i ? { ...f, [field]: v } : f));
  };

  const removeFact = (i: number) => setPersonalFacts(personalFacts.filter((_, idx) => idx !== i));

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const profileUrl = baseProfile?.username ? `${window.location.origin}/athlete/${baseProfile.username}` : null;

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <Card className={isPublic ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" : ""}>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isPublic
                ? <><Eye className="h-5 w-5 text-green-600" /><div><p className="font-semibold text-green-700 dark:text-green-400">Profile is Public</p><p className="text-xs text-muted-foreground">Viewable by coaches and athletes</p></div></>
                : <><EyeOff className="h-5 w-5 text-muted-foreground" /><div><p className="font-semibold">Profile is Private</p><p className="text-xs text-muted-foreground">Only you can see it</p></div></>
              }
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{isPublic ? "Public" : "Private"}</span>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
              {isPublic && profileUrl && (
                <Button variant="outline" size="sm" onClick={copyProfileLink}>
                  <Link2 className="h-3.5 w-3.5 mr-1" />Copy Link
                </Button>
              )}
              {isPublic && profileUrl && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={profileUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                </Button>
              )}
            </div>
          </div>

          {ap && (
            <div className="mt-4 flex gap-6 text-sm">
              <div className="text-center">
                <div className="font-bold text-lg">{ap.view_count || 0}</div>
                <div className="text-muted-foreground text-xs">Profile Views</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg">{followersCount || 0}</div>
                <div className="text-muted-foreground text-xs">Followers</div>
              </div>
              {ap.coach_view_count > 0 && (
                <div className="text-center">
                  <div className="font-bold text-lg text-primary">{ap.coach_view_count}</div>
                  <div className="text-muted-foreground text-xs">Coach Views</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo + AI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Profile Photo</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="relative">
              <Avatar className="h-28 w-28">
                <AvatarImage src={ap?.avatar_url} />
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {baseProfile?.full_name?.charAt(0) || baseProfile?.username?.charAt(0) || "A"}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg hover:bg-primary/90 transition-colors"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadAvatar(e.target.files[0]); }} />
            <p className="text-xs text-muted-foreground text-center">JPG, PNG or WebP. Max 5MB.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-yellow-500" />AI Summary</CardTitle>
            <CardDescription className="text-xs">Auto-generated from your training data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ap?.ai_summary ? (
              <p className="text-sm italic text-muted-foreground leading-relaxed">"{ap.ai_summary}"</p>
            ) : (
              <p className="text-sm text-muted-foreground">No summary yet. Generate one to impress coaches.</p>
            )}
            <Button onClick={generateSummary} disabled={generatingSummary} size="sm" variant="outline" className="w-full">
              {generatingSummary ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Generating...</> : <><Sparkles className="h-3.5 w-3.5 mr-2" />{ap?.ai_summary ? "Regenerate" : "Generate"} Summary</>}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Core info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Profile Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Graduation Year</Label>
              <Input type="number" placeholder="2026" value={gradYear} onChange={(e) => setGradYear(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Email (public)</Label>
              <Input type="email" placeholder="athlete@email.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><School className="h-3.5 w-3.5" />High School / College</Label>
              <Input placeholder="Lincoln High School" value={school} onChange={(e) => setSchool(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Club Team</Label>
              <Input placeholder="Capital Crew" value={clubTeam} onChange={(e) => setClubTeam(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Location</Label>
              <Input placeholder="Washington, DC" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea placeholder="Short bio about your rowing journey..." value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} />
            <p className="text-xs text-muted-foreground">{bio.length}/500</p>
          </div>

          <div className="space-y-1.5">
            <Label>Personal Statement</Label>
            <Textarea placeholder="Tell coaches about your goals, work ethic, and what makes you the athlete you are..." value={personalStatement} onChange={(e) => setPersonalStatement(e.target.value)} rows={5} maxLength={2000} />
          </div>
        </CardContent>
      </Card>

      {/* Personal Facts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Facts</CardTitle>
          <CardDescription className="text-xs">Up to 5 custom facts (e.g. "Rowing since: 2019", "Favorite workout: 30r20")</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {personalFacts.map((fact, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Label (e.g. Rowing since)" value={fact.label} onChange={(e) => updateFact(i, "label", e.target.value)} className="w-2/5" />
              <Input placeholder="Value (e.g. 2019)" value={fact.value} onChange={(e) => updateFact(i, "value", e.target.value)} className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => removeFact(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
          {personalFacts.length < 5 && (
            <Button variant="outline" size="sm" onClick={addFact}><Plus className="h-3.5 w-3.5 mr-1" />Add Fact</Button>
          )}
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card>
        <CardHeader><CardTitle className="text-base">Social Links</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Instagram className="h-4 w-4 text-pink-500 flex-shrink-0" />
            <Input placeholder="Instagram username (no @)" value={socialLinks.instagram} onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })} />
          </div>
          <div className="flex items-center gap-3">
            <Twitter className="h-4 w-4 text-sky-500 flex-shrink-0" />
            <Input placeholder="Twitter/X username (no @)" value={socialLinks.twitter} onChange={(e) => setSocialLinks({ ...socialLinks, twitter: e.target.value })} />
          </div>
          <div className="flex items-center gap-3">
            <Youtube className="h-4 w-4 text-red-500 flex-shrink-0" />
            <Input placeholder="YouTube channel URL" value={socialLinks.youtube} onChange={(e) => setSocialLinks({ ...socialLinks, youtube: e.target.value })} />
          </div>
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Input placeholder="Personal website URL" value={socialLinks.website} onChange={(e) => setSocialLinks({ ...socialLinks, website: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Public Profile"}
      </Button>
    </div>
  );
};
