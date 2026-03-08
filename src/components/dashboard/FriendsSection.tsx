import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserPlus, Check, X, Users, Clock, UserMinus, Ban, Search,
  Mail, Bell, Loader2, Eye, Send, MessageCircle, Activity, ArrowLeft, Dumbbell, Waves
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { NotificationSettings } from "./NotificationSettings";
import { MessageBoard } from "./MessageBoard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FriendsSectionProps {
  profile: any;
}

const FriendsSection = ({ profile }: FriendsSectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [dmFriend, setDmFriend] = useState<any>(null);

  // Fetch friendships
  const { data: friendships = [], refetch: refetchFriendships } = useQuery({
    queryKey: ["friendships", profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const [{ data: initiated }, { data: received }] = await Promise.all([
        supabase
          .from("friendships")
          .select("*, friend:profiles!friendships_friend_id_fkey(id, full_name, email, username)")
          .eq("user_id", profile.id)
          .eq("status", "accepted"),
        supabase
          .from("friendships")
          .select("*, friend:profiles!friendships_user_id_fkey(id, full_name, email, username)")
          .eq("friend_id", profile.id)
          .eq("status", "accepted"),
      ]);
      const all = [...(initiated || []), ...(received || [])];
      // Filter out entries where the friend profile couldn't be loaded
      return all.filter((f: any) => f.friend && f.friend.id);
    },
    enabled: !!profile?.id,
  });

  // Fetch pending requests
  const { data: requests = [], refetch: refetchRequests } = useQuery({
    queryKey: ["friend-requests", profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data } = await supabase
        .from("friendships")
        .select("*, user:profiles!friendships_user_id_fkey(id, full_name, email, username)")
        .eq("friend_id", profile.id)
        .eq("status", "pending");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Fetch sent requests
  const { data: sentRequests = [], refetch: refetchSent } = useQuery({
    queryKey: ["sent-requests", profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data } = await supabase
        .from("friendships")
        .select("*, friend:profiles!friendships_friend_id_fkey(id, full_name, email, username)")
        .eq("user_id", profile.id)
        .eq("status", "pending");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Friend goals & plans
  const { data: friendGoals } = useQuery({
    queryKey: ["friend-goals", friendships],
    queryFn: async () => {
      if (!friendships.length) return {};
      const friendIds = friendships.map((f: any) => f.friend?.id).filter(Boolean);
      if (!friendIds.length) return {};
      const { data } = await supabase.from("user_goals").select("*").in("user_id", friendIds);
      return data?.reduce((acc: any, goal: any) => { acc[goal.user_id] = goal; return acc; }, {}) || {};
    },
    enabled: friendships.length > 0,
  });

  const { data: friendPlans } = useQuery({
    queryKey: ["friend-plans", friendships],
    queryFn: async () => {
      if (!friendships.length) return {};
      const friendIds = friendships.map((f: any) => f.friend?.id).filter(Boolean);
      if (!friendIds.length) return {};
      const { data } = await supabase.from("workout_plans").select("*").in("user_id", friendIds);
      const grouped: Record<string, any[]> = {};
      data?.forEach(plan => { if (!grouped[plan.user_id]) grouped[plan.user_id] = []; grouped[plan.user_id].push(plan); });
      return grouped;
    },
    enabled: friendships.length > 0,
  });

  // Activity feed: recent erg + strength workouts from friends
  const { data: activityFeed = [] } = useQuery({
    queryKey: ["friend-activity", friendships],
    queryFn: async () => {
      if (!friendships.length) return [];
      const friendIds = friendships.map((f: any) => f.friend?.id).filter(Boolean);
      if (!friendIds.length) return [];
      const friendMap = friendships.reduce((acc: any, f: any) => {
        if (f.friend?.id) acc[f.friend.id] = f.friend;
        return acc;
      }, {});
        return acc;
      }, {});

      const [{ data: ergData }, { data: strengthData }] = await Promise.all([
        supabase
          .from("erg_workouts")
          .select("*")
          .in("user_id", friendIds)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("strength_workouts")
          .select("*")
          .in("user_id", friendIds)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const items: any[] = [];
      ergData?.forEach(w => items.push({ ...w, _type: "erg", _friend: friendMap[w.user_id] }));
      strengthData?.forEach(w => items.push({ ...w, _type: "strength", _friend: friendMap[w.user_id] }));
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return items.slice(0, 30);
    },
    enabled: friendships.length > 0,
  });

  const searchUsers = async () => {
    if (!searchTerm.trim() || !profile) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc("search_users_for_friend_request", {
        current_user_id: profile.id,
        search_term: searchTerm.trim(),
      });
      if (error) throw error;
      setSearchResults(data || []);
      if (!data?.length) {
        toast({ title: "No users found", description: "Try a different email or username.", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Search failed", description: error.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (targetUser: any) => {
    setSending(true);
    try {
      const [{ data: out }, { data: inc }] = await Promise.all([
        supabase.from("friendships").select("id, status").eq("user_id", profile.id).eq("friend_id", targetUser.id).limit(1),
        supabase.from("friendships").select("id, status").eq("user_id", targetUser.id).eq("friend_id", profile.id).limit(1),
      ]);
      const existing = [...(out || []), ...(inc || [])];
      if (existing.length > 0) {
        const msg = existing[0].status === "accepted" ? "You're already friends!"
          : existing[0].status === "pending" ? "Request already pending."
          : "Cannot send request to this user.";
        toast({ title: msg, variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("friendships").insert({
        user_id: profile.id,
        friend_id: targetUser.id,
        status: "pending",
      });
      if (error) throw error;

      toast({ title: "Request sent!", description: `Friend request sent to ${targetUser.username || targetUser.email}` });
      setSearchResults([]);
      setSearchTerm("");

      supabase.from("notifications").insert({
        user_id: targetUser.id,
        type: "friend_request",
        title: "New Friend Request",
        body: `${profile.full_name || profile.username || profile.email} sent you a friend request.`,
      }).then(({ error: e }) => e && console.error("Notification error:", e));

      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "friend_request",
          recipientEmail: targetUser.email,
          recipientName: targetUser.username,
          senderName: profile.full_name || profile.username || profile.email,
        },
      }).catch(e => console.error("Email error:", e));

      refetchSent();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleRequest = async (id: string, accept: boolean, requester?: any) => {
    try {
      if (accept) {
        await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
        if (requester?.id) {
          supabase.from("notifications").insert({
            user_id: requester.id,
            type: "friend_request",
            title: "Friend Request Accepted!",
            body: `${profile.full_name || profile.username || profile.email} accepted your friend request.`,
          }).then(({ error: e }) => e && console.error("Notification error:", e));
        }
        if (requester?.email) {
          supabase.functions.invoke("send-notification-email", {
            body: {
              type: "friend_accepted",
              recipientEmail: requester.email,
              recipientName: requester.full_name || requester.username,
              senderName: profile.full_name || profile.username || profile.email,
            },
          }).catch(e => console.error("Email error:", e));
        }
        toast({ title: "Request accepted!", description: "You are now friends." });
      } else {
        await supabase.from("friendships").delete().eq("id", id);
        toast({ title: "Request declined" });
      }
      refetchFriendships();
      refetchRequests();
    } catch (error) {
      toast({ title: "Error", description: "Failed to process request.", variant: "destructive" });
    }
  };

  const removeFriend = async (friendshipId: string, friendName: string) => {
    try {
      const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
      if (error) throw error;
      toast({ title: "Friend removed", description: `${friendName || "User"} removed.` });
      refetchFriendships();
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove friend.", variant: "destructive" });
    }
  };

  const blockUser = async (friendshipId: string, friendId: string, friendName: string) => {
    try {
      await supabase.from("friendships").delete().eq("id", friendshipId);
      await supabase.from("friendships").insert({ user_id: profile.id, friend_id: friendId, status: "blocked" });
      toast({ title: "User blocked", description: `${friendName || "User"} blocked.` });
      refetchFriendships();
    } catch (error) {
      toast({ title: "Error", description: "Failed to block user.", variant: "destructive" });
    }
  };

  const cancelRequest = async (friendshipId: string) => {
    try {
      await supabase.from("friendships").delete().eq("id", friendshipId);
      toast({ title: "Request cancelled" });
      refetchSent();
    } catch (error) {
      toast({ title: "Error", description: "Failed to cancel request.", variant: "destructive" });
    }
  };

  const formatTime = (interval: any) => {
    if (!interval) return null;
    return typeof interval === "string" ? interval : interval;
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // If DM is open, show the message board
  if (dmFriend) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setDmFriend(null)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Friends
        </Button>
        <MessageBoard
          friendId={dmFriend.id}
          currentUserId={profile.id}
          title={`Chat with ${dmFriend.full_name || dmFriend.username || "Friend"}`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="friends" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="friends" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 min-w-0">
            <Users className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Friends</span>
            <span className="text-xs text-muted-foreground">({friendships.length})</span>
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 min-w-0">
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">DMs</span>
          </TabsTrigger>
          <TabsTrigger value="feed" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 min-w-0">
            <Activity className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Feed</span>
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 min-w-0">
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Find</span>
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 min-w-0 relative">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Requests</span>
            {(requests.length + sentRequests.length) > 0 && (
              <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
                {requests.length + sentRequests.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Friends List Tab */}
        <TabsContent value="friends" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                Friends & Coaches
              </CardTitle>
            </CardHeader>
            <CardContent>
              {friendships.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/40" />
                  <p className="text-muted-foreground">No friends yet</p>
                  <p className="text-sm text-muted-foreground/70">Use the Find tab to search for friends</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {friendships.map((friendship: any) => {
                    const goals = friendGoals?.[friendship.friend.id];
                    const plans = friendPlans?.[friendship.friend.id] || [];

                    return (
                      <div key={friendship.id} className="rounded-xl border overflow-hidden">
                        <div className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                              {(friendship.friend.full_name || friendship.friend.username || "U").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold">
                                {friendship.friend.full_name || friendship.friend.username || "User"}
                              </p>
                              <p className="text-xs text-muted-foreground">{friendship.friend.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary"
                              onClick={() => setDmFriend(friendship.friend)}
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            {goals?.current_2k_time && (
                              <Badge variant="outline" className="text-xs gap-1 hidden sm:flex">
                                <Clock className="h-3 w-3" />
                                2K: {formatTime(goals.current_2k_time)}
                              </Badge>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                  <UserMinus className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Friend</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Remove {friendship.friend.full_name || friendship.friend.username || "this user"} from your friends?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeFriend(friendship.id, friendship.friend.full_name || friendship.friend.username)}>
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                  <Ban className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Block User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Block {friendship.friend.full_name || friendship.friend.username || "this user"}? They won't be able to send you requests.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => blockUser(friendship.id, friendship.friend.id, friendship.friend.full_name || friendship.friend.username)}
                                  >
                                    Block
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        {(goals || plans.length > 0) && (
                          <div className="px-4 pb-3 flex flex-wrap gap-2">
                            {goals?.current_2k_time && (
                              <Badge variant="secondary" className="text-xs">2K: {formatTime(goals.current_2k_time)}</Badge>
                            )}
                            {goals?.current_5k_time && (
                              <Badge variant="secondary" className="text-xs">5K: {formatTime(goals.current_5k_time)}</Badge>
                            )}
                            {goals?.current_6k_time && (
                              <Badge variant="secondary" className="text-xs">6K: {formatTime(goals.current_6k_time)}</Badge>
                            )}
                            {plans.length > 0 && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Badge variant="outline" className="text-xs cursor-pointer hover:bg-accent gap-1">
                                    <Eye className="h-3 w-3" />
                                    {plans.length} plan{plans.length > 1 ? "s" : ""}
                                  </Badge>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>{friendship.friend.full_name || friendship.friend.username}'s Plans</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3">
                                    {plans.map((plan: any) => (
                                      <div key={plan.id} className="p-3 border rounded-lg">
                                        <p className="font-medium">{plan.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {new Date(plan.created_at).toLocaleDateString()}
                                        </p>
                                        {Array.isArray(plan.workout_data) && (plan.workout_data as any[]).slice(0, 2).map((week: any) => (
                                          <div key={week.week} className="mt-2 text-sm">
                                            <span className="font-medium">Week {week.week}</span> - {week.phase}
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DMs Tab */}
        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="h-5 w-5 text-primary" />
                Direct Messages
              </CardTitle>
              <CardDescription>Select a friend to start chatting</CardDescription>
            </CardHeader>
            <CardContent>
              {friendships.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">Add friends to start messaging</p>
              ) : (
                <div className="space-y-2">
                  {friendships.map((friendship: any) => (
                    <button
                      key={friendship.id}
                      onClick={() => setDmFriend(friendship.friend)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent/50 transition-colors text-left"
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {(friendship.friend.full_name || friendship.friend.username || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">
                          {friendship.friend.full_name || friendship.friend.username || "User"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{friendship.friend.email}</p>
                      </div>
                      <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Feed Tab */}
        <TabsContent value="feed" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-primary" />
                Friend Activity
              </CardTitle>
              <CardDescription>Recent workouts from your friends</CardDescription>
            </CardHeader>
            <CardContent>
              {activityFeed.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <Activity className="h-12 w-12 mx-auto text-muted-foreground/40" />
                  <p className="text-muted-foreground">No recent activity</p>
                  <p className="text-sm text-muted-foreground/70">Your friends' workouts will show up here</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-2">
                  <div className="space-y-3">
                    {activityFeed.map((item: any) => {
                      const friendName = item._friend?.full_name || item._friend?.username || "Friend";
                      const initial = friendName.charAt(0).toUpperCase();
                      const isErg = item._type === "erg";

                      return (
                        <div key={`${item._type}-${item.id}`} className="flex gap-3 p-3 rounded-xl border bg-card">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-sm truncate">{friendName}</p>
                              <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(item.created_at)}</span>
                            </div>
                            {isErg ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="text-xs gap-1">
                                  <Waves className="h-3 w-3" />
                                  {item.workout_type}
                                </Badge>
                                {item.distance && (
                                  <span className="text-xs text-muted-foreground">{item.distance}m</span>
                                )}
                                {item.duration && (
                                  <span className="text-xs text-muted-foreground">{item.duration}</span>
                                )}
                                {item.avg_split && (
                                  <span className="text-xs text-muted-foreground">Avg {item.avg_split}/500m</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="text-xs gap-1">
                                  <Dumbbell className="h-3 w-3" />
                                  {item.exercise}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {item.sets}×{item.reps} @ {item.weight}lbs
                                </span>
                              </div>
                            )}
                            {item.notes && (
                              <p className="text-xs text-muted-foreground mt-1 italic">"{item.notes}"</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5 text-primary" />
                Find Friends & Coaches
              </CardTitle>
              <CardDescription>Search by email address or username</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Email or username..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchUsers()}
                    className="pl-9"
                  />
                </div>
                <Button onClick={searchUsers} disabled={searching || !searchTerm.trim()}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Results</p>
                  {searchResults.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-accent/50 transition-colors">
                      <div>
                        <p className="font-semibold">{user.username || "User"}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <Button size="sm" onClick={() => sendRequest(user)} disabled={sending} className="gap-1.5">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Incoming Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {requests.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">No pending requests</p>
              ) : (
                <div className="space-y-2">
                  {requests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-3 rounded-xl border bg-card hover:bg-accent/50 transition-colors">
                      <div>
                        <p className="font-semibold">{req.user.full_name || req.user.username || "User"}</p>
                        <p className="text-sm text-muted-foreground">{req.user.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleRequest(req.id, true, req.user)} className="gap-1.5">
                          <Check className="h-4 w-4" /> Accept
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleRequest(req.id, false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {sentRequests.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="h-5 w-5 text-muted-foreground" />
                  Sent Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {sentRequests.map((req: any) => (
                    <div key={req.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                      <div>
                        <p className="font-semibold">{req.friend.full_name || req.friend.username || "User"}</p>
                        <p className="text-sm text-muted-foreground">{req.friend.email}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => cancelRequest(req.id)} className="text-destructive hover:text-destructive">
                        <X className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FriendsSection;
