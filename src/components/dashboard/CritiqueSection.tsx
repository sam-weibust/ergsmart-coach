import { useState, useRef, useCallback, useEffect } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload, Video, AlertTriangle, CheckCircle, Target, Dumbbell,
  Loader2, X, Play, History, ChevronDown, ChevronUp, Star, Camera,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Category {
  name: string;
  rating: number;
  notes: string;
}

interface CritiqueResult {
  overallScore: number;
  phase: string;
  summary: string;
  categories?: Category[];
  strengths: string[];
  issues: { area: string; problem: string; fix: string }[];
  drills: string[];
  priorityFix: string;
}

interface PastAnalysis {
  id: string;
  video_path: string | null;
  notes: string | null;
  critique: CritiqueResult;
  created_at: string;
}

// Evenly spaced through the stroke cycle
const FRAME_POSITIONS = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85];
const FRAME_W = 800;
const FRAME_H = 600;
const YOUTUBE_TUTORIAL_ID = "zQ82RYIFLN8";

const CritiqueSection = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [progressStage, setProgressStage] = useState<0 | 1 | 2 | 3>(0);
  const [critique, setCritique] = useState<CritiqueResult | null>(null);
  const [history, setHistory] = useState<PastAnalysis[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("technique_analyses" as any)
        .select("id, video_path, notes, critique, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setHistory(data as PastAnalysis[]);
    } catch { /* table may not exist yet */ }
    finally { setHistoryLoading(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Please upload a video file"); return; }
    if (file.size > 200 * 1024 * 1024) { toast.error("Video must be under 200MB"); return; }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setCritique(null);
  };

  const clearVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setCritique(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Extract 6 frames at fixed positions using Canvas API — no server needed
  const extractFrames = useCallback((): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = videoUrl!;

      const canvas = document.createElement("canvas");
      canvas.width = FRAME_W;
      canvas.height = FRAME_H;
      const ctx = canvas.getContext("2d")!;

      const frames: string[] = [];
      let idx = 0;

      const seekNext = () => {
        if (idx >= FRAME_POSITIONS.length) {
          resolve(frames);
          video.src = "";
          return;
        }
        setProgress(Math.round((idx / FRAME_POSITIONS.length) * 35)); // 0–35%
        setProgressLabel(`Extracting frames from video… (${idx + 1}/${FRAME_POSITIONS.length})`);
        video.currentTime = video.duration * FRAME_POSITIONS[idx];
      };

      video.onloadedmetadata = () => { seekNext(); };

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
        frames.push(canvas.toDataURL("image/jpeg", 0.85));
        idx++;
        seekNext();
      };

      video.onerror = () => reject(new Error("Could not load video for frame extraction"));
    });
  }, [videoUrl]);

  // Upload extracted JPEG frames to Supabase storage (not the full video)
  const uploadFrames = async (userId: string, frames: string[]): Promise<string | null> => {
    try {
      const basePath = `${userId}/${Date.now()}`;
      for (let i = 0; i < frames.length; i++) {
        const match = frames[i].match(/^data:([^;]+);base64,(.+)$/);
        if (!match) continue;
        const binary = atob(match[2]);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        await supabase.storage
          .from("technique-videos")
          .upload(`${basePath}/frame-${i + 1}.jpg`, bytes, { contentType: "image/jpeg", upsert: false });
      }
      return basePath;
    } catch {
      return null;
    }
  };

  const handleAnalyze = async () => {
    if (!videoUrl || !videoFile) return;
    setIsAnalyzing(true);
    setProgress(0);
    setProgressStage(1);
    setProgressLabel("Extracting frames from video…");
    setCritique(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      if (!session?.access_token || !user?.id) throw new Error("Not logged in");

      // ── Stage 1: Extract frames (0–35%) ────────────────────────────────────
      const frames = await extractFrames();
      setProgress(35);

      // ── Stage 2: Upload frames + call AI (35–85%) ──────────────────────────
      setProgressStage(2);
      setProgressLabel("Analyzing technique with AI…");
      setProgress(40);

      // Upload frames in background (don't block AI call)
      const framesPathPromise = uploadFrames(user.id, frames);

      setProgress(45);

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-technique`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ user_id: user.id, frames, notes, frames_path: null }),
        }
      );

      setProgress(80);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(err.error || `Server error ${resp.status}`);
      }

      // ── Stage 3: Parse & display (85–100%) ────────────────────────────────
      setProgressStage(3);
      setProgressLabel("Generating feedback…");
      setProgress(85);

      const data = await resp.json();
      if (!data.critique) throw new Error("No critique returned from AI");

      // Attach frames_path once upload resolves (fire-and-forget, don't block display)
      framesPathPromise.catch(() => {});

      setProgress(100);
      setCritique(data.critique);
      toast.success("Form analysis complete!");
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze video");
    } finally {
      setIsAnalyzing(false);
      setProgressStage(0);
    }
  };

  const scoreColor = (score: number) =>
    score >= 8 ? "text-green-600 dark:text-green-400"
    : score >= 5 ? "text-yellow-600 dark:text-yellow-400"
    : "text-red-600 dark:text-red-400";

  const ratingBar = (rating: number) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${rating >= 8 ? "bg-green-500" : rating >= 5 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${rating * 10}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold ${scoreColor(rating)}`}>{rating}/10</span>
    </div>
  );

  const CritiqueDisplay = ({ c }: { c: CritiqueResult }) => (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 mb-4">
            <div className={`text-5xl font-bold ${scoreColor(c.overallScore)}`}>{c.overallScore}/10</div>
            <div>
              <Badge variant="secondary" className="mb-1">{c.phase} phase</Badge>
              <p className="text-foreground text-sm">{c.summary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Target className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-foreground mb-1">Priority Fix</p>
              <p className="text-muted-foreground text-sm">{c.priorityFix}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {c.categories && c.categories.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" /> Category Ratings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {c.categories.map((cat, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{cat.name}</span>
                </div>
                {ratingBar(cat.rating)}
                {cat.notes && <p className="text-xs text-muted-foreground mt-1">{cat.notes}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {c.strengths.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" /> Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {c.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-green-500 mt-0.5">✓</span>{s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {c.issues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" /> Areas to Improve
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {c.issues.map((issue, i) => (
              <div key={i} className="border-l-2 border-yellow-500/50 pl-3">
                <p className="font-medium text-sm text-foreground">{issue.area}</p>
                <p className="text-sm text-muted-foreground">{issue.problem}</p>
                <p className="text-sm text-primary mt-1">→ {issue.fix}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {c.drills.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary" /> Recommended Drills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {c.drills.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-primary mt-0.5">{i + 1}.</span>{d}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Stage labels for the progress indicator
  const stages = [
    { n: 1, label: "Extracting frames from video" },
    { n: 2, label: "Analyzing technique with AI" },
    { n: 3, label: "Generating feedback" },
  ];

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" /> AI Form Critique
          </CardTitle>
          <CardDescription>
            Upload a rowing video. 6 frames are extracted automatically and analyzed by AI — results in under 20 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!videoUrl ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium text-foreground">Click to upload a rowing video</p>
              <p className="text-sm text-muted-foreground mt-1">MP4, MOV, or WebM — max 200MB</p>
              <p className="text-xs text-muted-foreground mt-2 opacity-70">
                6 frames extracted at 10%, 25%, 40%, 55%, 70%, 85% of duration
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black">
                <video ref={videoRef} src={videoUrl} controls className="w-full max-h-[400px] object-contain" />
                <Button size="icon" variant="destructive" className="absolute top-2 right-2 h-8 w-8" onClick={clearVideo}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {videoFile?.name} ({(videoFile!.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />

          <Textarea
            placeholder="Any notes? e.g. 'Steady state, I think my catch is too early'…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            disabled={isAnalyzing}
          />

          {/* Progress indicator with stage steps */}
          {isAnalyzing && (
            <div className="space-y-3">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between gap-1">
                {stages.map((s) => (
                  <div
                    key={s.n}
                    className={`flex-1 text-center text-xs px-1 py-1 rounded transition-colors ${
                      progressStage === s.n
                        ? "bg-primary/15 text-primary font-semibold"
                        : progressStage > s.n
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      {progressStage > s.n ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : progressStage === s.n ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <span className="h-3 w-3 rounded-full border border-current inline-block" />
                      )}
                    </div>
                    <span className="leading-tight block">{s.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">{progressLabel}</p>
            </div>
          )}

          <Button onClick={handleAnalyze} disabled={!videoUrl || isAnalyzing} className="w-full" size="lg">
            {isAnalyzing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</>
            ) : (
              <><Camera className="h-4 w-4 mr-2" />Analyze My Form</>
            )}
          </Button>
        </CardContent>
      </Card>

      {critique && <CritiqueDisplay c={critique} />}

      {/* Previous Analyses */}
      {!historyLoading && history.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Previous Analyses ({history.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((h) => (
              <div key={h.id} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedHistory(expandedHistory === h.id ? null : h.id)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${scoreColor(h.critique.overallScore)}`}>
                        {h.critique.overallScore}/10
                      </span>
                      {h.critique.phase && (
                        <Badge variant="secondary" className="text-xs">{h.critique.phase}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(h.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {h.notes && ` · ${h.notes.slice(0, 40)}${h.notes.length > 40 ? "…" : ""}`}
                    </p>
                  </div>
                  {expandedHistory === h.id
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
                {expandedHistory === h.id && (
                  <div className="border-t p-3">
                    <CritiqueDisplay c={h.critique} />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tutorial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proper Rowing Form — Beginner Tutorial</CardTitle>
          <CardDescription>Learn the fundamentals of proper rowing technique on the erg.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative w-full rounded-xl overflow-hidden" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${YOUTUBE_TUTORIAL_ID}`}
              title="Proper Rowing Technique"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CritiqueSection;
