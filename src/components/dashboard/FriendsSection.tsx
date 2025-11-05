import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Check, X, Users } from "lucide-react";

interface FriendsSectionProps {
  profile: any;
}

const FriendsSection = ({ profile }: FriendsSectionProps) => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
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
      .select("*, friend:profiles!friendships_friend_id_fkey(id, full_name, email)")
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

  const sendRequest = async () => {
    if (!email || !profile) return;

    try {
      const { data: friendProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();

      if (!friendProfile) {
        toast({
          title: "User not found",
          description: "No user found with that email.",
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

      setEmail("");
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
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendRequest()}
            />
            <Button onClick={sendRequest}>Send Request</Button>
          </div>
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
            <div className="space-y-2">
              {friendships.map((friendship) => (
                <div key={friendship.id} className="p-3 border rounded-lg">
                  <p className="font-semibold">{friendship.friend.full_name || "User"}</p>
                  <p className="text-sm text-muted-foreground">{friendship.friend.email}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FriendsSection;