import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Check, X, Users, Eye, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface FriendsSectionProps {
  profile: any;
}

const FriendsSection = ({ profile }: FriendsSectionProps) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [friendships, setFriendships] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    fetchFriendships();
    fetchRequests();
  }, [profile]);

  const fetchFriendships = async () => {
    if (!profile) return;

    const { data } = await supabase
      .from("friendships")
      .select("*, friend:profiles!friendships_friend_id_fkey(id, full_name, email, username)")
      .eq("user_id", profile.id)
      .eq("status", "accepted");

    setFriendships(data || []);
  };

  const fetchRequests = async () => {
    if (!profile) return;

    const { data } = await supabase
      .from("friendships")
      .select("*, user:profiles!friendships_user_id_fkey(id, full_name, email)")
      .eq("friend_id", profile.id)
      .eq("status", "pending");

    setRequests(data || []);
  };

  // Fetch friend's workout plans (shared with you)
  const { data: friendPlans } = useQuery({
    queryKey: ["friend-plans", friendships],
    queryFn: async () => {
      if (!friendships.length) return {};
      
      const friendIds = friendships.map(f => f.friend.id);
      
      const { data } = await supabase
        .from("workout_plans")
        .select("*")
        .in("user_id", friendIds);

      // Group by user_id
      const grouped: Record<string, any[]> = {};
      data?.forEach(plan => {
        if (!grouped[plan.user_id]) grouped[plan.user_id] = [];
        grouped[plan.user_id].push(plan);
      });
      
      return grouped;
    },
    enabled: friendships.length > 0,
  });

  // Fetch friend's goals for comparison
  const { data: friendGoals } = useQuery({
    queryKey: ["friend-goals", friendships],
    queryFn: async () => {
      if (!friendships.length) return {};
      
      const friendIds = friendships.map(f => f.friend.id);
      
      const { data } = await supabase
        .from("user_goals")
        .select("*")
        .in("user_id", friendIds);

      return data?.reduce((acc: any, goal: any) => {
        acc[goal.user_id] = goal;
        return acc;
      }, {}) || {};
    },
    enabled: friendships.length > 0,
  });

  const sendRequest = async () => {
    if (!searchTerm || !profile) return;

    try {
      const { data: friendProfiles } = await supabase
        .from("profiles")
        .select("id, email, username")
        .or(`email.eq.${searchTerm},username.ilike.${searchTerm}`)
        .neq("id", profile.id)
        .limit(1);

      const friendProfile = friendProfiles?.[0];

      if (!friendProfile) {
        toast({
          title: "User not found",
          description: "No user found with that email or username.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.from("friendships").insert({
        user_id: profile.id,
        friend_id: friendProfile.id,
        status: "pending",
      });

      if (error) throw error;

      toast({
        title: "Request sent!",
        description: "Friend request has been sent.",
      });

      setSearchTerm("");
    } catch (error) {
      console.error("Error sending request:", error);
      toast({
        title: "Error",
        description: "Failed to send request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRequest = async (id: string, accept: boolean) => {
    try {
      if (accept) {
        await supabase
          .from("friendships")
          .update({ status: "accepted" })
          .eq("id", id);

        toast({
          title: "Request accepted!",
          description: "You are now friends.",
        });
      } else {
        await supabase.from("friendships").delete().eq("id", id);

        toast({
          title: "Request declined",
          description: "Friend request has been declined.",
        });
      }

      fetchFriendships();
      fetchRequests();
    } catch (error) {
      console.error("Error handling request:", error);
      toast({
        title: "Error",
        description: "Failed to process request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatTime = (interval: any) => {
    if (!interval) return null;
    if (typeof interval === "string") return interval;
    return interval;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Friend or Coach
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter email or username"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendRequest()}
            />
            <Button onClick={sendRequest}>Send Request</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Search by email address or username to add friends or coaches.
          </p>
        </CardContent>
      </Card>

      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-semibold">{req.user.full_name || "User"}</p>
                    <p className="text-sm text-muted-foreground">{req.user.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleRequest(req.id, true)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRequest(req.id, false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Friends & Coaches
          </CardTitle>
        </CardHeader>
        <CardContent>
          {friendships.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No friends or coaches yet. Add some above!
            </p>
          ) : (
            <Accordion type="single" collapsible>
              {friendships.map((friendship) => {
                const goals = friendGoals?.[friendship.friend.id];
                const plans = friendPlans?.[friendship.friend.id] || [];
                
                return (
                  <AccordionItem key={friendship.id} value={friendship.id}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{friendship.friend.full_name || friendship.friend.username || "User"}</span>
                        {goals?.current_2k_time && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            2K: {formatTime(goals.current_2k_time)}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">{friendship.friend.email}</p>
                      
                      {/* Performance Comparison */}
                      {goals && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Times
                          </h4>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">2K:</span>{" "}
                              {formatTime(goals.current_2k_time) || "Not set"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">5K:</span>{" "}
                              {formatTime(goals.current_5k_time) || "Not set"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">6K:</span>{" "}
                              {formatTime(goals.current_6k_time) || "Not set"}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Their Plans */}
                      {plans.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Their Plans ({plans.length})
                          </h4>
                          <div className="space-y-2">
                            {plans.slice(0, 3).map((plan: any) => (
                              <Dialog key={plan.id}>
                                <DialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="w-full justify-between">
                                    <span className="truncate">{plan.title}</span>
                                    <span className="text-xs text-muted-foreground ml-2">
                                      {new Date(plan.created_at).toLocaleDateString()}
                                    </span>
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>{plan.title}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    {Array.isArray(plan.workout_data) ? (plan.workout_data as any[]).slice(0, 4).map((week: any) => (
                                      <div key={week.week} className="space-y-2">
                                        <h4 className="font-semibold">Week {week.week} - {week.phase}</h4>
                                        <div className="grid gap-2">
                                          {week.days?.slice(0, 3).map((day: any) => (
                                            <div key={day.day} className="p-2 border rounded text-sm">
                                              <span className="font-medium">Day {day.day}:</span>{" "}
                                              {day.ergWorkout?.zone} - {day.ergWorkout?.description}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )) : (
                                      <p className="text-muted-foreground">No workout data</p>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            ))}
                          </div>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FriendsSection;