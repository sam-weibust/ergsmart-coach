import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  user_id: string;
  type: "workout_reminder" | "friend_request" | "message" | "plan_shared";
  title: string;
  body: string;
  data?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify JWT authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("Missing or invalid authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the token using anon key client
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: callerUser }, error: authError } = await userClient.auth.getUser();
    
    if (authError || !callerUser) {
      console.error("JWT verification failed:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUserId = callerUser.id;
    console.log(`Authenticated user: ${callerUserId}`);

    const { user_id, type, title, body, data }: NotificationRequest = await req.json();

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!user_id || !uuidRegex.test(user_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing user_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Input validation
    if (!type || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTypes = ["workout_reminder", "friend_request", "message", "plan_shared"];
    if (!validTypes.includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid notification type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (title.length > 100 || body.length > 500) {
      return new Response(
        JSON.stringify({ error: "Title max 100 chars, body max 500 chars" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: users can only notify themselves or their friends
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    if (callerUserId !== user_id) {
      // Check if they are friends
      const { data: friendship, error: friendError } = await serviceClient
        .from("friendships")
        .select("id")
        .eq("status", "accepted")
        .or(`and(user_id.eq.${callerUserId},friend_id.eq.${user_id}),and(user_id.eq.${user_id},friend_id.eq.${callerUserId})`)
        .maybeSingle();

      if (friendError || !friendship) {
        console.error("Authorization failed - not friends:", friendError);
        return new Response(
          JSON.stringify({ error: "You can only send notifications to yourself or friends" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Creating notification for user ${user_id}: ${type} - ${title}`);

    // Check if user has notifications enabled
    const { data: subscription } = await serviceClient
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!subscription) {
      console.log("User has notifications disabled, skipping");
      return new Response(
        JSON.stringify({ success: true, message: "Notifications disabled for user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert notification using service client
    const { error } = await serviceClient.from("notifications").insert({
      user_id,
      type,
      title,
      body,
      data,
    });

    if (error) {
      console.error("Error inserting notification:", error);
      throw error;
    }

    console.log("Notification created successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in create-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
