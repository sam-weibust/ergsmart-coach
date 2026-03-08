import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Share2, Check, Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ShareWorkoutDialogProps {
  workoutId: string;
  workoutType: "erg" | "strength";
  userId: string;
}

const ShareWorkoutDialog = ({ workoutId, workoutType, userId }: ShareWorkoutDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [sharedWith, setSharedWith] = useState<string[]>([]);

  const { data: friends = [] } = useQuery({
    queryKey: ["friends-for-share", userId],
    queryFn: async () => {
      const [{ data: initiated }, { data: received }] = await Promise.all([
        supabase
          .from("friendships")
          .select("*, friend:profiles!friendships_friend_id_fkey(id, full_name, username, email)")
          .eq("user_id", userId)
          .eq("status", "accepted"),
        supabase
          .from("friendships")
          .select("*, friend:profiles!friendships_user_id_fkey(id, full_name, username, email)")
          .eq("friend_id", userId)
          .eq("status", "accepted"),
      ]);
      const all = [...(initiated || []), ...(received || [])];
      return all.map((f: any) => f.friend).filter(Boolean);
    },
    enabled: open,
  });

  // Fetch existing shares for this workout
  const { data: existingShares = [] } = useQuery({
    queryKey: ["workout-shares", workoutId, workoutType],
    queryFn: async () => {
      const col = workoutType === "erg" ? "erg_workout_id" : "strength_workout_id";
      const { data } = await supabase
        .from("workout_shares")
        .select("shared_with")
        .eq(col, workoutId)
        .eq("shared_by", userId);
      return (data || []).map((s: any) => s.shared_with);
    },
    enabled: open,
  });

  const allShared = [...existingShares, ...sharedWith];

  const handleShare = async (friendId: string) => {
    setSharing(friendId);
    try {
      const insertData: any = {
        shared_by: userId,
        shared_with: friendId,
      };
      if (workoutType === "erg") {
        insertData.erg_workout_id = workoutId;
      } else {
        insertData.strength_workout_id = workoutId;
      }

      const { error } = await supabase.from("workout_shares").insert(insertData);
      if (error) throw error;

      setSharedWith((prev) => [...prev, friendId]);

      // Send notification
      await supabase.from("notifications").insert({
        user_id: friendId,
        title: "Workout Shared",
        body: `A friend shared a ${workoutType} workout with you!`,
        type: "workout_share",
      });

      toast({ title: "Shared!", description: "Workout shared with friend." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSharing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
          <Share2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share with Friends
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-72">
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No friends to share with yet.
            </p>
          ) : (
            <div className="space-y-2">
              {friends.map((friend: any) => {
                const alreadyShared = allShared.includes(friend.id);
                return (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm">{friend.full_name || friend.username || "Friend"}</p>
                      <p className="text-xs text-muted-foreground">{friend.email}</p>
                    </div>
                    {alreadyShared ? (
                      <Button variant="ghost" size="sm" disabled className="gap-1 text-primary">
                        <Check className="h-4 w-4" /> Shared
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleShare(friend.id)}
                        disabled={sharing === friend.id}
                        className="gap-1"
                      >
                        {sharing === friend.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Share2 className="h-4 w-4" />
                        )}
                        Share
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ShareWorkoutDialog;
