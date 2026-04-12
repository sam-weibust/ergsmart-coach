import { useState, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Video,
  AlertTriangle,
  CheckCircle,
  Target,
  Dumbbell,
  Loader2,
  X,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CritiqueResult {
  overallScore: number;
  phase: string;
  summary: string;
  strengths: string[];
  issues: { area: string; problem: string; fix: string }[];
  drills: string[];
  priorityFix: string;
}

const YOUTUBE_TUTORIAL_ID = "zQ82RYIFLN8";

const CritiqueSection = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [critique, setCritique] = useState<CritiqueResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const extractFrames = useCallback(async (): Promise<string[]> => {
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
          const time = interval * i;
          setExtractionProgress(Math.round((i / frameCount) * 50));

          await new Promise<void>((res) => {
            video.currentTime = time;
            video.onseeked = () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frames.push(canvas.toDataURL("image/jpeg", 0.7));
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
    if (!videoUrl) return;

    setIsAnalyzing(true);
    setExtractionProgress(0);
    setCritique(null);

    try {
      toast.info("Extracting frames from video...");
      const frames = await extractFrames();

      setExtractionProgress(60);
      toast.info("Analyzing your rowing form...");

      const [{ data: { session } }, { data: { user } }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);

      if (!session?.access_token || !user?.id) {
        throw new Error("Not logged in");
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/critique-rowing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            user_id: user.id,
            frames,
            notes,
          }),
        }
      );

      setExtractionProgress(90);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const data = await resp.json();
      setCritique(data.critique);
      setExtractionProgress(100);
      toast.success("Form analysis complete!");
    } catch (err: any) {
      console.error("Critique error:", err);
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
            Upload a video of yourself rowing on the erg and our AI coach will analyze your form and provide corrections.
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
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full max-h-[400px] object-contain"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={clearVideo}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {videoFile?.name} ({(videoFile!.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          <Textarea
            placeholder="Any notes? e.g. 'This is my steady state piece' or 'I think my catch is too early'..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />

          {isAnalyzing && (
            <div className="space-y-2">
              <Progress value={extractionProgress} />
              <p className="text-sm text-muted-foreground text-center">
                {extractionProgress < 50
                  ? "Extracting frames..."
                  : extractionProgress < 90
                  ? "AI is analyzing your form..."
                  : "Almost done..."}
              </p>
            </div>
          )}

          <Button
            onClick={handleAnalyze}
            disabled={!videoUrl || isAnalyzing}
            className="w-full"
            size="lg"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Analyze My Form
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Critique Result */}
      {critique && (
        <div className="space-y-4 animate-fade-in">
          {/* Score & Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`text-5xl font-bold ${scoreColor(critique.overallScore)}`}>
                  {critique.overallScore}/10
                </div>
                <div>
                  <Badge variant="secondary" className="mb-1">
                    {critique.phase} phase
                  </Badge>
                  <p className="text-foreground">{critique.summary}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Priority Fix */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Target className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground mb-1">Priority Fix</p>
                  <p className="text-muted-foreground">{critique.priorityFix}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strengths */}
          {critique.strengths.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {critique.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-green-500 mt-0.5">✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Issues */}
          {critique.issues.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Areas to Improve
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {critique.issues.map((issue, i) => (
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

          {/* Recommended Drills */}
          {critique.drills.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  Recommended Drills
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {critique.drills.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-0.5">{i + 1}.</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tutorial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📚 Proper Rowing Form — Beginner Tutorial</CardTitle>
          <CardDescription>
            Watch this video to learn the fundamentals of proper rowing technique on the erg.
          </CardDescription>
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
