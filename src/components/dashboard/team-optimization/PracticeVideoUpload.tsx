import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Video, Upload, Trash2, Play, Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";

interface Props {
  sessionId: string;
  teamId: string;
  userId: string;
}

const PracticeVideoUpload = ({ sessionId, teamId, userId }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const { data: videos = [] } = useQuery({
    queryKey: ["practice-videos", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_videos" as any)
        .select("*, uploader:profiles!practice_videos_uploaded_by_fkey(full_name, username)")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const enriched = await Promise.all((data || []).map(async (v: any) => {
        if (v.video_url) return v;
        const { data: urlData } = await supabase.storage
          .from("practice-videos")
          .createSignedUrl(v.video_path, 3600);
        return { ...v, signed_url: urlData?.signedUrl };
      }));
      return enriched;
    },
    enabled: !!sessionId,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast({ title: "Please select a video file (MP4 or MOV)", variant: "destructive" });
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      toast({ title: "Video must be under 500 MB", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  };

  const uploadVideo = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const ext = selectedFile.name.split(".").pop() || "mp4";
      const path = `${teamId}/${sessionId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("practice-videos")
        .upload(path, selectedFile);
      if (uploadErr) throw uploadErr;

      const { error: dbErr } = await supabase.from("practice_videos" as any).insert({
        session_id: sessionId,
        team_id: teamId,
        uploaded_by: userId,
        video_path: path,
        description: description || null,
      });
      if (dbErr) throw dbErr;

      toast({ title: "Video uploaded!" });
      queryClient.invalidateQueries({ queryKey: ["practice-videos", sessionId] });
      setOpen(false);
      setSelectedFile(null);
      setDescription("");
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteVideo = useMutation({
    mutationFn: async (v: any) => {
      await supabase.storage.from("practice-videos").remove([v.video_path]);
      const { error } = await supabase.from("practice_videos" as any).delete().eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practice-videos", sessionId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isNative = Capacitor.isNativePlatform();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Videos ({(videos as any[]).length})</h4>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
          <Video className="h-3 w-3" />Add Video
        </Button>
      </div>

      {(videos as any[]).length === 0 && (
        <p className="text-xs text-muted-foreground">No videos yet. Any team member can add one.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {(videos as any[]).map((v: any) => {
          const url = v.signed_url || v.video_url;
          return (
            <div key={v.id} className="relative rounded-lg border overflow-hidden bg-muted/50 group">
              {url ? (
                playingId === v.id ? (
                  <video
                    src={url}
                    controls
                    autoPlay
                    className="w-full aspect-video object-cover"
                    onEnded={() => setPlayingId(null)}
                  />
                ) : (
                  <button
                    onClick={() => setPlayingId(v.id)}
                    className="w-full aspect-video flex items-center justify-center bg-black/60 hover:bg-black/40 transition-colors"
                  >
                    <Play className="h-8 w-8 text-white" />
                  </button>
                )
              ) : (
                <div className="aspect-video flex items-center justify-center">
                  <Video className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="p-1.5">
                <p className="text-[10px] text-muted-foreground truncate">
                  {v.description || (v.uploader?.full_name || v.uploader?.username || "Video")}
                </p>
              </div>
              <button
                onClick={() => deleteVideo.mutate(v)}
                className="absolute top-1 right-1 hidden group-hover:flex bg-black/50 rounded p-0.5 text-white hover:bg-red-600/70"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload Practice Video</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedFile ? (
              <div className="flex items-center gap-2 p-2 rounded border bg-muted/50">
                <Video className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button onClick={() => setSelectedFile(null)} className="ml-auto text-muted-foreground hover:text-destructive">
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors"
              >
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isNative ? "Tap to select video from library" : "Click to select video (MP4, MOV)"}
                </p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/*"
              capture={isNative ? undefined : undefined}
              className="hidden"
              onChange={handleFileChange}
            />
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input className="h-9 text-sm mt-1" placeholder="e.g. 2k piece, catch focus..."
                value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <Button
              className="w-full gap-2"
              onClick={uploadVideo}
              disabled={!selectedFile || uploading}
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading...</> : <><Upload className="h-4 w-4" />Upload Video</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PracticeVideoUpload;
