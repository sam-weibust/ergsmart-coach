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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, type, title, body, data }: NotificationRequest = await req.json();

    console.log(`Creating notification for user ${user_id}: ${type} - ${title}`);

    // Check if user has notifications enabled
    const { data: subscription } = await supabase
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

    // Insert notification
    const { error } = await supabase.from("notifications").insert({
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
