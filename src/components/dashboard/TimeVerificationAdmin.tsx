import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Eye, Clock, User, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const formatInterval = (interval: string | null): string => {
  if (!interval) return "-";
  const match = interval.match(/(\d+):(\d+):(\d+\.?\d*)/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseFloat(match[3]);
    const totalMinutes = hours * 60 + minutes;
    return `${totalMinutes}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
  return interval;
};

const getDistanceLabel = (meters: number): string => {
  const labels: Record<number, string> = {
    2000: "2K",
    5000: "5K",
    6000: "6K",
  };
  return labels[meters] || `${meters}m`;
};

export const TimeVerificationAdmin = () => {
  const queryClient = useQueryClient();
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const { data: pendingSubmissions, isLoading } = useQuery({
    queryKey: ["pending-time-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("verified_times")
        .select(`
          *,
          profiles!verified_times_user_id_fkey(full_name, username, email)
        `)
        .eq("verification_status", "pending")
        .order("submitted_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const updateData: any = {
        verification_status: status,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      };

      if (reason) {
        updateData.rejection_reason = reason;
      }

      const { error } = await supabase
        .from("verified_times")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.status === "verified" ? "Time verified!" : "Submission rejected");
      queryClient.invalidateQueries({ queryKey: ["pending-time-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      setSelectedSubmission(null);
      setShowRejectDialog(false);
      setRejectReason("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Action failed");
    },
  });

  const handleApprove = (id: string) => {
    verifyMutation.mutate({ id, status: "verified" });
  };

  const handleReject = () => {
    if (!selectedSubmission || !rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    verifyMutation.mutate({ 
      id: selectedSubmission.id, 
      status: "rejected", 
      reason: rejectReason 
    });
  };

  const getScreenshotUrl = (path: string) => {
    const { data } = supabase.storage
      .from("verification-screenshots")
      .getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Time Verification Queue
        </CardTitle>
        <CardDescription>
          Review and verify submitted erg times
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : pendingSubmissions && pendingSubmissions.length > 0 ? (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Athlete</TableHead>
                  <TableHead>Distance</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Screenshot</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSubmissions.map((submission: any) => (
                  <TableRow key={submission.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {submission.profiles?.full_name || submission.profiles?.username || "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {submission.profiles?.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getDistanceLabel(submission.distance)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-bold">
                        {formatInterval(submission.time_achieved)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline">{submission.category}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {submission.gender} / {submission.weight_class}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSubmission(submission)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(submission.id)}
                          disabled={verifyMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedSubmission(submission);
                            setShowRejectDialog(true);
                          }}
                          disabled={verifyMutation.isPending}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p>No pending submissions to review</p>
          </div>
        )}

        {/* Screenshot Preview Dialog */}
        <Dialog open={!!selectedSubmission && !showRejectDialog} onOpenChange={() => setSelectedSubmission(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Verify Submission</DialogTitle>
            </DialogHeader>
            {selectedSubmission && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Athlete</Label>
                    <p className="font-medium">
                      {selectedSubmission.profiles?.full_name || selectedSubmission.profiles?.username}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Submitted Time</Label>
                    <p className="font-mono font-bold text-lg">
                      {formatInterval(selectedSubmission.time_achieved)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Distance</Label>
                    <p>{getDistanceLabel(selectedSubmission.distance)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Category</Label>
                    <p>{selectedSubmission.category} ({selectedSubmission.gender}, {selectedSubmission.weight_class})</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Screenshot Proof</Label>
                  <div className="border rounded-lg overflow-hidden bg-muted">
                    <img
                      src={getScreenshotUrl(selectedSubmission.screenshot_url)}
                      alt="Erg screenshot"
                      className="w-full h-auto max-h-96 object-contain"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectDialog(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleApprove(selectedSubmission.id)}
                    disabled={verifyMutation.isPending}
                  >
                    {verifyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Verify Time
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Submission</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Reason for Rejection *</Label>
                <Textarea
                  placeholder="e.g., Screenshot is unclear, time doesn't match, etc."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleReject}
                  disabled={verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Confirm Rejection
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
