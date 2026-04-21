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
  Loader2, X, Play, History, ChevronDown, ChevronUp, Star,
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

const YOUTUBE_TUTORIAL_ID = "zQ82RYIFLN8";

const CritiqueSection = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [critique, setCritique] = useState<CritiqueResult | null>(null);
  const [history, setHistory] = useState<PastAnalysis[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    loadHistory();
  }, []);

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
    } catch {
      // Silently ignore if table doesn't exist yet
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please upload a video file (MP4, MOV, etc.)");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Video must be under 100MB");
      return;
    }
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

  const uploadVideo = async (user: any): Promise<string | null> => {
    if (!videoFile) return null;
    try {
      const ext = videoFile.name.split(".").pop() ?? "mp4";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("technique-videos")
        .upload(path, videoFile, { contentType: videoFile.type, upsert: false });
      if (error) {
        console.error("Video upload error:", error.message);
        return null;
      }
      return path;
    } catch {
      return null;
    }
  };

  const extractFrames = useCallback(async (onProgress: (p: number) => void): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.src = videoUrl!;
      video.crossOrigin = "anonymous";
      video.muted = true;

      video.onloadedmetadata = async () => {
        const duration = video.duration;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        const frameCount = Math.min(6, Math.max(4, Math.floor(duration)));
        const interval = duration / (frameCount + 1);
        const frames: string[] = [];

        canvas.width = Math.min(video.videoWidth, 640);
        canvas.height = Math.min(video.videoHeight, 480);

        for (let i = 1; i <= frameCount; i++) {
          await new Promise<void>((res) => {
            video.currentTime = interval * i;
            video.onseeked = () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frames.push(canvas.toDataURL("image/jpeg", 0.7));
              onProgress(Math.round((i / frameCount) * 100));
              res();
            };
          });
        }
        resolve(frames);
      };

      video.onerror = () => reject(new Error("Failed to load video"));
    });
  }, [videoUrl]);

  const handleAnalyze = async () => {
    if (!videoUrl || !videoFile) return;
    setIsAnalyzing(true);
    setProgress(0);
    setProgressLabel("Preparing...");
    setCritique(null);

    try {
      const { data: { session }, } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      if (!session?.access_token || !user?.id) throw new Error("Not logged in");

      // Upload video and extract frames in parallel
      setProgressLabel("Uploading video & extracting frames...");
      const [videoPath, frames] = await Promise.all([
        uploadVideo(user),
        extractFrames((p) => setProgress(Math.round(p * 0.5))),
      ]);

      setProgress(55);
      setProgressLabel("AI is analyzing your rowing form...");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-technique`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ user_id: user.id, frames, notes, video_path: videoPath }),
        }
      );

      setProgress(90);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const data = await resp.json();
      setCritique(data.critique);
      setProgress(100);
      toast.success("Form analysis complete!");
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze video");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 8) return "text-green-600 dark:text-green-400";
    if (score >= 5) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const ratingBar = (rating: number) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${rating >= 8 ? "bg-green-500" : rating >= 5 ? "bg-yellow-500" : "bg-red-500"}`}
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
              <Star className="h-4 w-4 text-primary" />
              Category Ratings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {c.categories.map((cat, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{cat.name}</span>
                  </div>
                  {ratingBar(cat.rating)}
                  {cat.notes && <p className="text-xs text-muted-foreground mt-1">{cat.notes}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {c.strengths.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Strengths
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
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Areas to Improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {c.issues.map((issue, i) => (
                <div key={i} className="border-l-2 border-yellow-500/50 pl-3">
                  <p className="font-medium text-sm text-foreground">{issue.area}</p>
                  <p className="text-sm text-muted-foreground">{issue.problem}</p>
                  <p className="text-sm text-primary mt-1">→ {issue.fix}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {c.drills.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary" />
              Recommended Drills
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

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            AI Form Critique
          </CardTitle>
          <CardDescription>
            Upload a video of yourself rowing on the erg. Our AI coach analyzes your form and gives specific corrections.
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
              <p className="text-sm text-muted-foreground mt-1">MP4, MOV, or WebM — max 100MB</p>
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
            placeholder="Any notes? e.g. 'Steady state piece, I think my catch is too early'..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />

          {isAnalyzing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground text-center">{progressLabel}</p>
            </div>
          )}

          <Button onClick={handleAnalyze} disabled={!videoUrl || isAnalyzing} className="w-full" size="lg">
            {isAnalyzing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" />Analyze My Form</>
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
              <History className="h-4 w-4 text-primary" />
              Previous Analyses ({history.length})
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
                  {expandedHistory === h.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
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
