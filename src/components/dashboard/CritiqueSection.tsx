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
  Loader2, X, History, ChevronDown, ChevronUp, Star, Camera,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSessionUser } from '@/lib/getUser';

interface Category { name: string; rating: number; notes: string; }
interface CritiqueResult {
  overallScore: number; phase: string; summary: string;
  categories?: Category[];
  strengths: string[]; issues: { area: string; problem: string; fix: string }[];
  drills: string[]; priorityFix: string;
}
interface PastAnalysis {
  id: string; video_path: string | null; notes: string | null;
  critique: CritiqueResult; created_at: string;
}

const FRAME_POSITIONS = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85];
const FRAME_W = 640;
const FRAME_H = 480;
const YOUTUBE_TUTORIAL_ID = "zQ82RYIFLN8";

// Step labels
const STEPS = [
  "Uploading video",
  "Extracting frames",
  "Analyzing technique",
  "Complete",
];

const CritiqueSection = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);   // 0=idle 1=upload 2=frames 3=ai 4=done
  const [stepDetail, setStepDetail] = useState(""); // e.g. "frame 3 of 6"
  const [error, setError] = useState<string | null>(null);
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
      const user = await getSessionUser();
      if (!user) return;
      const { data } = await supabase
        .from("technique_analyses" as any)
        .select("id, video_path, notes, critique, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setHistory(data as PastAnalysis[]);
    } catch (e: any) {
      console.warn("loadHistory:", e?.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    console.log("[critique] file selected:", file.name, file.size, file.type);
    if (!file.type.startsWith("video/")) {
      setError("Please upload a video file (MP4, MOV, AVI, or WebM).");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError("Video must be under 500 MB.");
      return;
    }
    setError(null);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setCritique(null);
  };

  const clearVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setCritique(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Extract frames using Canvas API — waits for seeked event before drawing
  const extractFrames = useCallback((): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      if (!videoUrl) { reject(new Error("No video URL available")); return; }

      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.src = videoUrl;

      const canvas = document.createElement("canvas");
      canvas.width = FRAME_W;
      canvas.height = FRAME_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas 2D context not available")); return; }

      const frames: string[] = [];
      let idx = 0;
      let settled = false;
      let seekTimeoutId: ReturnType<typeof setTimeout>;

      const done = (result: string[] | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(seekTimeoutId);
        video.onseeked = null;
        video.onerror = null;
        video.onloadedmetadata = null;
        video.src = "";
        if (result instanceof Error) reject(result);
        else resolve(result);
      };

      const seekNext = () => {
        clearTimeout(seekTimeoutId);
        if (idx >= FRAME_POSITIONS.length) { done(frames); return; }

        const targetTime = video.duration * FRAME_POSITIONS[idx];
        console.log(`[critique] seeking to frame ${idx + 1}/${FRAME_POSITIONS.length} — t=${targetTime.toFixed(2)}s`);

        // React state updates from event handlers — batched in React 18
        setProgress(Math.round(10 + (idx / FRAME_POSITIONS.length) * 40));
        setStepDetail(`frame ${idx + 1} of ${FRAME_POSITIONS.length}`);

        // Timeout in case seeked never fires (some codecs/formats)
        seekTimeoutId = setTimeout(() => {
          console.warn(`[critique] seeked event timed out for frame ${idx + 1}, drawing anyway`);
          captureFrame();
        }, 5000);

        video.currentTime = targetTime;
      };

      const captureFrame = () => {
        clearTimeout(seekTimeoutId);
        try {
          ctx.drawImage(video, 0, 0, FRAME_W, FRAME_H);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
          const b64Len = dataUrl.length - "data:image/jpeg;base64,".length;
          console.log(`[critique] frame ${idx + 1} captured — base64 length: ${b64Len}`);
          if (b64Len < 100) {
            console.warn(`[critique] frame ${idx + 1} appears blank (base64 length ${b64Len})`);
          }
          frames.push(dataUrl);
        } catch (e: any) {
          console.error(`[critique] canvas.drawImage failed for frame ${idx + 1}:`, e?.message);
        }
        idx++;
        seekNext();
      };

      video.onloadedmetadata = () => {
        const dur = video.duration;
        console.log(`[critique] video metadata loaded — duration: ${dur.toFixed(2)}s, size: ${video.videoWidth}x${video.videoHeight}`);
        if (!isFinite(dur) || dur <= 0) {
          done(new Error(`Video duration is invalid (${dur}) — the file may be corrupt or an unsupported format.`));
          return;
        }
        seekNext();
      };

      video.onseeked = () => { captureFrame(); };
      video.onerror = () => {
        const code = (video.error?.code ?? -1);
        const msg = video.error?.message ?? "unknown error";
        done(new Error(`Video failed to load (code ${code}): ${msg}. Try a different file or format.`));
      };
    });
  }, [videoUrl]);

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
    } catch (e: any) {
      console.warn("[critique] frame upload failed (non-fatal):", e?.message);
      return null;
    }
  };

  const handleAnalyze = async () => {
    if (!videoUrl || !videoFile) return;
    setIsAnalyzing(true);
    setProgress(0);
    setStepIndex(1);
    setStepDetail("reading file");
    setError(null);
    setCritique(null);

    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const { data: { session } } = await supabase.auth.getSession();
      const user = await getSessionUser();
      if (!session?.access_token || !user?.id) {
        throw new Error("You must be logged in to analyze video. Please refresh and log in again.");
      }
      console.log("[critique] user:", user.id, "| file:", videoFile.name, videoFile.size, videoFile.type);

      // ── Stage 1: Extract frames ───────────────────────────────────────────
      setStepIndex(2);
      setProgress(10);
      console.log("[critique] starting frame extraction");
      let frames: string[];
      try {
        frames = await extractFrames();
      } catch (e: any) {
        throw new Error(`Frame extraction failed: ${e.message}`);
      }

      const validFrames = frames.filter((f) => f.length > 100);
      console.log(`[critique] extracted ${frames.length} frames, ${validFrames.length} valid`);
      if (validFrames.length === 0) {
        throw new Error("Frame extraction produced no usable images. The video may be too short, corrupt, or in an unsupported codec. Try converting to MP4 (H.264).");
      }

      setProgress(50);

      // Upload in background — don't block AI call
      const framesPathPromise = uploadFrames(user.id, validFrames);

      // ── Stage 2: Call AI ──────────────────────────────────────────────────
      setStepIndex(3);
      setStepDetail("");
      setProgress(55);

      const payloadBytes = validFrames.reduce((acc, f) => acc + f.length, 0);
      console.log(`[critique] calling analyze-technique — frames: ${validFrames.length}, payload size: ${(payloadBytes / 1024).toFixed(0)} KB`);

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-technique`;
      console.log("[critique] endpoint:", fnUrl);

      let resp: Response;
      try {
        resp = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ user_id: user.id, frames: validFrames, notes, frames_path: null }),
        });
      } catch (e: any) {
        throw new Error(`Network error calling AI service: ${e.message}. Check your connection.`);
      }

      console.log(`[critique] edge function response: HTTP ${resp.status}`);

      const rawText = await resp.text();
      console.log("[critique] raw response body:", rawText.slice(0, 1000));

      if (!resp.ok) {
        let errMsg = `Server error ${resp.status}`;
        try {
          const parsed = JSON.parse(rawText);
          errMsg = parsed.error ?? parsed.message ?? errMsg;
        } catch {}
        throw new Error(`AI service error (${resp.status}): ${errMsg}`);
      }

      // ── Stage 3: Parse & display ──────────────────────────────────────────
      setProgress(90);
      setStepIndex(4);
      setStepDetail("");

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Could not parse AI response as JSON. Raw: ${rawText.slice(0, 200)}`);
      }

      console.log("[critique] parsed response:", JSON.stringify(data).slice(0, 500));

      if (!data.critique) {
        throw new Error(`AI response missing 'critique' field. Got: ${JSON.stringify(data).slice(0, 200)}`);
      }

      framesPathPromise.catch(() => {});
      setProgress(100);
      setCritique(data.critique);
      toast.success("Form analysis complete!");
      loadHistory();

    } catch (err: any) {
      const msg = err?.message ?? "Unknown error analyzing video";
      console.error("[critique] FAILED:", msg);
      setError(msg);
      toast.error("Analysis failed — see error above");
    } finally {
      setIsAnalyzing(false);
      if (!error) {
        setTimeout(() => { setStepIndex(0); setStepDetail(""); setProgress(0); }, 2000);
      }
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

      {c.strengths?.length > 0 && (
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

      {c.issues?.length > 0 && (
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

      {c.drills?.length > 0 && (
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

  // Active step label
  const activeStepLabel = stepIndex > 0 && stepIndex <= STEPS.length
    ? STEPS[stepIndex - 1]
    : "";

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" /> AI Form Critique
          </CardTitle>
          <CardDescription>
            Upload a rowing video (MP4, MOV, AVI, WebM). 6 frames are extracted and analyzed by AI — results in under 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Visible error box */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-sm mb-1">Analysis Failed</p>
                <p className="text-sm leading-relaxed">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="shrink-0 opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {!videoUrl ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium text-foreground">Click to upload a rowing video</p>
              <p className="text-sm text-muted-foreground mt-1">MP4, MOV, AVI, or WebM — max 500 MB</p>
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
                {videoFile?.name} ({(videoFile!.size / 1024 / 1024).toFixed(1)} MB · {videoFile?.type || "unknown type"})
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/avi,video/x-msvideo,video/webm,video/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          <Textarea
            placeholder="Any notes? e.g. 'Steady state, I think my catch is too early'…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            disabled={isAnalyzing}
          />

          {/* Progress indicator */}
          {isAnalyzing && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {activeStepLabel}{stepDetail ? ` — ${stepDetail}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between gap-1 pt-1">
                {STEPS.map((label, i) => {
                  const n = i + 1;
                  const done = stepIndex > n;
                  const active = stepIndex === n;
                  return (
                    <div
                      key={n}
                      className={`flex-1 text-center text-xs px-1 py-1.5 rounded transition-colors ${
                        active ? "bg-primary/15 text-primary font-semibold"
                        : done ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        {done ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : active ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <span className="h-3 w-3 rounded-full border border-current inline-block" />
                        )}
                      </div>
                      <span className="leading-tight block">{label}</span>
                    </div>
                  );
                })}
              </div>
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
